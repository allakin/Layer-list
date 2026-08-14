/* A node reference that outlives an await is dead: for instance sublayers even
   reading .removed or .children throws. Nothing may escape as a plugin error. */
const P = require("../harness/plugin.js");
const f = global.figma;

/* a sublayer that behaves exactly like Figma's: every access throws */
function deadSublayer(id) {
  const err = () => { throw new Error('in get_children: The node (instance sublayer or table cell) with id "' + id + '" does not exist'); };
  return new Proxy({}, {
    get(_, prop) {
      if (prop === "id") return id;
      if (prop === "type") return "FRAME";
      err();
    },
    has() { return true; }
  });
}

const dead = deadSublayer("I4002:62425;102044:5115;4002:67972");

const page = P.mkNode({ id:"page", name:"Page 1", type:"PAGE", children:[
  P.mkNode({ id:"live", name:"Live frame", type:"FRAME", layoutMode:"VERTICAL", layoutWrap:"NO_WRAP",
    fills:[], strokes:[], effects:[], layoutGrids:[], boundVariables:{}, children:[
      { id:"ok", name:"Healthy child", type:"RECTANGLE", fills:[], strokes:[], effects:[] }
  ]})
]});
page.selection=[]; page.loadAsync=async()=>{}; page.findAll=()=>[]; page.findAllWithCriteria=()=>[];
page.on=(t,fn)=>{ P.pageEvents[t]=fn; }; page.off=()=>{};
f.root.children=[page]; f.currentPage=page; f.root.id="doc-5";
f.getStyleByIdAsync = async () => null;
f.variables.getVariableByIdAsync = async () => null;
f.variables.getLocalVariableCollectionsAsync = async () => [];
f.getLocalPaintStylesAsync = async () => [];

const uncaught = [];
process.on("uncaughtException", e => uncaught.push("uncaught: " + e.message.slice(0,60)));
process.on("unhandledRejection", e => uncaught.push("unhandled: " + String(e && e.message).slice(0,60)));

require(require("path").join(__dirname, "..", "..", "src", "code.js"));
const wait = ms => new Promise(r=>setTimeout(r,ms));

(async () => {
  await P.send({ type:"ready" });
  await wait(150);

  /* 1. the background walker meets a dead sublayer mid-scan */
  P.nodesById.get("live").children.push(dead);
  await P.send({ type:"rescanLibrary", scanAll:false });
  await wait(200);
  console.log("background scan survived:", true);

  /* 2. a nodechange event points at it */
  P.pageEvents.nodechange({ nodeChanges: [{ type:"PROPERTY_CHANGE", node: dead }] });
  await wait(600);
  console.log("nodechange survived:     ", true);

  /* 3. it sits in the layer tree while the tree is built */
  await P.send({ type:"setExpanded", id:"live", expanded:true });
  P.posted.length = 0;
  await P.send({ type:"refresh" });
  await wait(200);
  const layers = P.posted.filter(m=>m.type==="layers").pop();
  console.log("tree still built:        ", !!layers,
    "| rows:", layers ? layers.rows.map(r=>r.name).join(", ") : "-");

  /* 4. and it is the selection */
  page.selection = [dead];
  P.events.selectionchange();
  await wait(200);
  console.log("selectionchange survived:", true);

  const notes = P.posted.filter(m=>m.notify);
  console.log("\nplugin error toasts:", notes.length ? notes.map(x=>x.notify) : "(none)");
  console.log("uncaught/unhandled: ", uncaught.length ? uncaught : "(none)");
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
