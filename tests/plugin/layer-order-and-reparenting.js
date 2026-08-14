const P = require("../harness/plugin.js");
const f = global.figma;

const page = P.mkNode({ id:"page", name:"Page 1", type:"PAGE", children:[
  P.mkNode({ id:"plain", name:"Plain frame", type:"FRAME", layoutMode:"NONE", children:[
    { id:"p1", name:"first drawn (bottom)", type:"RECTANGLE" },
    { id:"p2", name:"second drawn", type:"RECTANGLE" },
    { id:"p3", name:"last drawn (top)", type:"RECTANGLE" }
  ]}),
  P.mkNode({ id:"auto", name:"Table header", type:"FRAME", layoutMode:"VERTICAL", children:[
    { id:"a1", name:"Title", type:"TEXT" },
    { id:"a2", name:"Icons", type:"INSTANCE" },
    { id:"a3", name:"Bottom divider", type:"RECTANGLE" },
    { id:"a4", name:"End divider", type:"RECTANGLE" },
    { id:"a5", name:"Start divider", type:"RECTANGLE" }
  ]})
]});
page.selection = []; page.on=()=>{}; page.off=()=>{}; page.loadAsync=async()=>{}; page.findAll=()=>[];
f.root.children = [page]; f.currentPage = page;

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

async function layers() {
  P.posted.length = 0;
  await P.send({ type: "refresh" });
  await new Promise(r => setTimeout(r, 20));
  const m = P.posted.filter(x => x.type === "layers").pop();
  if (!m) throw new Error("no layers message; got: " + P.posted.map(x=>x.type||"notify").join(","));
  return m;
}

(async () => {
  await P.send({ type: "setExpanded", id: "plain", expanded: true });
  await P.send({ type: "setExpanded", id: "auto", expanded: true });
  const L = await layers();
  const show = (p) => L.rows.filter(r => r.parentId === p).map(r => r.name).join("  →  ");
  console.log("PLAIN frame  (z-order, top-most first):\n  " + show("plain"));
  console.log("AUTO-LAYOUT  (layout order, children[0] first):\n  " + show("auto"));

  await P.send({ type:"move", ids:["a5"], targetId:"a1", pos:"above" });
  console.log("\ndrag 'Start divider' ABOVE 'Title' in auto layout:");
  console.log("  children[] = " + P.nodesById.get("auto").children.map(c=>c.name).join(", "));
  let L2 = await layers();
  console.log("  panel      = " + L2.rows.filter(r=>r.parentId==="auto").map(r=>r.name).join("  →  "));

  await P.send({ type:"move", ids:["p1"], targetId:"p3", pos:"above" });
  console.log("\ndrag 'first drawn' ABOVE 'last drawn' in plain frame:");
  console.log("  children[] = " + P.nodesById.get("plain").children.map(c=>c.name).join(", "));
  L2 = await layers();
  console.log("  panel      = " + L2.rows.filter(r=>r.parentId==="plain").map(r=>r.name).join("  →  "));

  const notes = P.posted.filter(m => m.notify);
  console.log("\nnotifications:", notes.length ? notes : "(none)");
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
