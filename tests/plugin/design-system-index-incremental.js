/* Incremental top-up: the index learns new tokens from edits and selection,
   with no rescan. */
const P = require("../harness/plugin.js");
const f = global.figma;

const STYLES = {
  "S:libPaint": { id:"S:libPaint", key:"kp", name:"Colors/Text/Primary", type:"PAINT", remote:true,
                  paints:[{type:"SOLID",color:{r:.1,g:.1,b:.1}}] },
  "S:newLib":   { id:"S:newLib",   key:"kn", name:"Colors/Bg/Accent", type:"PAINT", remote:true,
                  paints:[{type:"SOLID",color:{r:0,g:.6,b:1}}] }
};
const VARS = {
  "VariableID:g4": { id:"VariableID:g4", key:"kg4", name:"g-spacing-4", resolvedType:"FLOAT", remote:true,
                     variableCollectionId:"C:grid", valuesByMode:{ "M:1": 4 }, scopes:[], description:"" },
  "VariableID:r8": { id:"VariableID:r8", key:"kr8", name:"radius/8", resolvedType:"FLOAT", remote:true,
                     variableCollectionId:"C:grid", valuesByMode:{ "M:1": 8 }, scopes:[], description:"" }
};
const COLLECTION = { id:"C:grid", key:"kcol", name:"Grid", remote:true,
  modes:[{modeId:"M:1",name:"Mode 1"}], defaultModeId:"M:1", variableIds:[] };
f.getStyleByIdAsync = async (id) => STYLES[id] || null;
f.variables.getVariableByIdAsync = async (id) => VARS[id] || null;
f.variables.getVariableCollectionByIdAsync = async (id) => id === "C:grid" ? COLLECTION : null;
f.variables.getLocalVariableCollectionsAsync = async () => [];
f.getLocalPaintStylesAsync = async () => [];

const page = P.mkNode({ id:"page", name:"Page 1", type:"PAGE", children:[
  P.mkNode({ id:"a", name:"Card", type:"FRAME", layoutMode:"VERTICAL", layoutWrap:"NO_WRAP",
    fillStyleId:"S:libPaint", boundVariables:{ itemSpacing:{type:"VARIABLE_ALIAS",id:"VariableID:g4"} },
    fills:[], strokes:[], effects:[], layoutGrids:[], children:[
      { id:"u", name:"Plain", type:"RECTANGLE", fills:[], strokes:[], effects:[] }
  ]})
]});
page.selection=[]; page.loadAsync=async()=>{}; page.findAll=()=>[]; page.findAllWithCriteria=()=>[];
page.on = (t, fn) => { P.pageEvents[t] = fn; };
page.off = () => {};
f.root.children=[page]; f.currentPage=page; f.root.id="doc-2";

require(require("path").join(__dirname, "..", "..", "code.js"));
const wait = ms => new Promise(r=>setTimeout(r,ms));
function tally() {
  const st = P.posted.filter(m=>m.type==="styles").pop();
  const lv = P.posted.filter(m=>m.type==="libraryVariables").pop();
  return {
    styles: st ? st.library.paint.length + st.library.text.length : 0,
    tokens: lv ? lv.collections.reduce((n,c)=>n+c.variables.length,0) : 0,
    names: lv ? lv.collections.flatMap(c=>c.variables.map(v=>v.name)) : []
  };
}

(async () => {
  await P.send({ type:"ready" });
  await wait(120);
  let t = tally();
  console.log("baseline:            ", t.styles, "styles,", t.tokens, "tokens", t.names);

  /* an edit introduces a token and a style the index has never seen */
  const rect = P.nodesById.get("u");
  rect.boundVariables = { topLeftRadius: { type:"VARIABLE_ALIAS", id:"VariableID:r8" } };
  rect.fillStyleId = "S:newLib";
  console.log("\nnodechange handler registered:", typeof P.pageEvents.nodechange === "function");
  P.pageEvents.nodechange({ nodeChanges: [{ type:"PROPERTY_CHANGE", node: rect }] });
  await wait(600);
  t = tally();
  console.log("after edit (no rescan):", t.styles, "styles,", t.tokens, "tokens", t.names);

  /* selecting a layer also feeds the index */
  const deep = { id:"d", name:"Deep", type:"RECTANGLE", fills:[], strokes:[], effects:[],
                 boundVariables:{} , removed:false };
  P.nodesById.set("d", deep);
  page.selection = [deep];
  console.log("\nselectionchange handler registered:", typeof P.events.selectionchange === "function");
  P.events.selectionchange();
  await wait(120);
  console.log("selection path ran without error");

  await wait(1700);
  const saved = P.clientStore["libIndex:doc-2"];
  console.log("\npersisted:", saved.styles.length, "styles,", saved.vars.length, "tokens");
  console.log("notifications:", P.posted.filter(m=>m.notify).length ? P.posted.filter(m=>m.notify) : "(none)");
})().catch(e => { console.error("FAIL:", e.stack.split("\n").slice(0,3).join(" | ")); process.exit(1); });
