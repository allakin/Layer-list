const P = require("../harness/plugin.js");
const f = global.figma;

const page = P.mkNode({ id:"page", name:"Page 1", type:"PAGE", children:[
  P.mkNode({ id:"comp", name:"Body Empty", type:"COMPONENT", layoutMode:"NONE", children:[
    P.mkNode({ id:"f933", name:"Frame 2087328933", type:"FRAME", layoutMode:"VERTICAL", layoutWrap:"NO_WRAP", children:[
      { id:"t1", name:"Top", type:"FRAME", layoutMode:"VERTICAL", layoutWrap:"NO_WRAP", children:[] },
      { id:"h1", name:"Row", type:"FRAME", layoutMode:"HORIZONTAL", layoutWrap:"NO_WRAP", children:[] },
      { id:"w1", name:"Wrapped", type:"FRAME", layoutMode:"HORIZONTAL", layoutWrap:"WRAP", children:[] },
      { id:"g1", name:"Grid", type:"FRAME", layoutMode:"GRID", children:[] },
      { id:"p1", name:"Plain", type:"FRAME", layoutMode:"NONE", children:[] }
    ]})
  ]}),
  P.mkNode({ id:"out", name:"Scrollbar", type:"FRAME", layoutMode:"VERTICAL", layoutWrap:"NO_WRAP", children:[
    { id:"out2", name:"Inner", type:"RECTANGLE" }
  ]})
]});
page.selection = []; page.on=()=>{}; page.off=()=>{}; page.loadAsync=async()=>{}; page.findAll=()=>[];
f.root.children=[page]; f.currentPage=page;
require(require("path").join(__dirname, "..", "..", "src", "code.js"));

(async () => {
  for (const id of ["comp","f933","out"]) await P.send({ type:"setExpanded", id, expanded:true });
  P.posted.length = 0;
  await P.send({ type:"refresh" });
  await new Promise(r=>setTimeout(r,20));
  const L = P.posted.filter(m=>m.type==="layers").pop();
  console.log("name".padEnd(20), "inComponent", "autolayout");
  L.rows.forEach(r => console.log(r.name.padEnd(20), String(!!r.inComponent).padEnd(12), r.autolayout || "-"));
  const bad = L.rows.filter(r => (r.name==="Scrollbar"||r.name==="Inner") && r.inComponent);
  console.log("\noutside-component rows wrongly flagged:", bad.length ? bad.map(r=>r.name) : "(none)");
  console.log("notifications:", P.posted.filter(m=>m.notify).length ? P.posted.filter(m=>m.notify) : "(none)");
})().catch(e=>{ console.error("FAIL:", e.message); process.exit(1); });
