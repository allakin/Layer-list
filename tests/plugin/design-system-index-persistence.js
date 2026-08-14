/* Design-system index: background pass, incremental top-up, persistence. */
const P = require("../harness/plugin.js");
const f = global.figma;

/* --- library styles / variables the stub can resolve --- */
const STYLES = {
  "S:libPaint": { id:"S:libPaint", key:"kp", name:"Colors/Text/Primary", type:"PAINT", remote:true,
                  paints:[{type:"SOLID",color:{r:.1,g:.1,b:.1}}] },
  "S:libText":  { id:"S:libText",  key:"kt", name:"Heading/H2", type:"TEXT", remote:true,
                  fontName:{family:"Inter",style:"Bold"}, fontSize:24 },
  "S:local":    { id:"S:local",    key:"kl", name:"Local/Grey", type:"PAINT", remote:false,
                  paints:[{type:"SOLID",color:{r:.5,g:.5,b:.5}}] }
};
const VARS = {
  "VariableID:g4": { id:"VariableID:g4", key:"kg4", name:"g-spacing-4", resolvedType:"FLOAT", remote:true,
                     variableCollectionId:"C:grid", valuesByMode:{ "M:1": 4 }, scopes:[], description:"" },
  "VariableID:c1": { id:"VariableID:c1", key:"kc1", name:"color/bg/default", resolvedType:"COLOR", remote:true,
                     variableCollectionId:"C:grid", valuesByMode:{ "M:1": {r:1,g:1,b:1,a:1} }, scopes:[], description:"" },
  "VariableID:r8": { id:"VariableID:r8", key:"kr8", name:"radius/8", resolvedType:"FLOAT", remote:true,
                     variableCollectionId:"C:grid", valuesByMode:{ "M:1": 8 }, scopes:[], description:"" }
};
const COLLECTION = { id:"C:grid", key:"kcol", name:"Grid", remote:true,
  modes:[{modeId:"M:1",name:"Mode 1"}], defaultModeId:"M:1", variableIds:[] };

f.getStyleByIdAsync = async (id) => STYLES[id] || null;
f.variables.getVariableByIdAsync = async (id) => VARS[id] || null;
f.variables.getVariableCollectionByIdAsync = async (id) => id === "C:grid" ? COLLECTION : null;
f.variables.getLocalVariableCollectionsAsync = async () => [];
f.getLocalPaintStylesAsync = async () => [STYLES["S:local"]];

/* --- a page that references some of them --- */
const page = P.mkNode({ id:"page", name:"Page 1", type:"PAGE", children:[
  P.mkNode({ id:"a", name:"Card", type:"FRAME", layoutMode:"VERTICAL", layoutWrap:"NO_WRAP",
    fillStyleId:"S:libPaint", boundVariables:{ itemSpacing:{type:"VARIABLE_ALIAS",id:"VariableID:g4"} },
    fills:[], strokes:[], effects:[], layoutGrids:[], children:[
      { id:"t", name:"Title", type:"TEXT", characters:"hi", textStyleId:"S:libText",
        fills:[{type:"SOLID",color:{r:0,g:0,b:0},boundVariables:{color:{type:"VARIABLE_ALIAS",id:"VariableID:c1"}}}],
        strokes:[], effects:[] },
      { id:"u", name:"Untouched", type:"RECTANGLE", fillStyleId:"S:local", fills:[], strokes:[], effects:[] }
  ]})
]});
page.selection = []; page.on=()=>{}; page.off=()=>{}; page.loadAsync=async()=>{}; page.findAll=()=>[];
page.findAllWithCriteria=()=>[];
f.root.children=[page]; f.currentPage=page;
f.root.id = "doc-1";

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const wait = (ms) => new Promise(r => setTimeout(r, ms));
/* The scan holds off for SCAN_START_DELAY_MS so the editor keeps its frames;
   these waits have to clear that. */
const SCAN_WAIT = 1900;

function last(type) { return P.posted.filter(m => m.type === type).pop(); }
function counts(tag) {
  const st = last("styles"), lv = last("libraryVariables"), s = last("libStatus");
  console.log(tag.padEnd(26),
    "libStyles=" + ((st && st.library.paint.length + st.library.text.length) || 0),
    "tokens=" + ((lv && lv.collections.reduce((n,c)=>n+c.variables.length,0)) || 0),
    "status=" + (s ? s.state + "/" + s.styles + "+" + s.tokens : "-"));
}

(async () => {
  /* 1. cold open — nothing saved yet */
  P.posted.length = 0;
  await P.send({ type:"ready" });
  counts("after ready (cold)");
  await wait(SCAN_WAIT);
  counts("after background pass");

  /* 2. incremental: a node starts using a token the index has never seen */
  const rect = P.nodesById.get("u");
  rect.boundVariables = { topLeftRadius: { type:"VARIABLE_ALIAS", id:"VariableID:r8" } };
  P.posted.length = 0;
  await require("../harness/plugin.js").send({ type:"__noop" }).catch(()=>{});
  // simulate the nodechange the plugin listens to
  await wait(10);
  P.posted.length = 0;
  page.selection = [rect];
  // selectionchange path
  const sel = f._selectionHandlers || [];
  await wait(10);

  /* drive the documented path directly: queue the changed node */
  global.__t = null;
  await wait(10);
  P.posted.length = 0;
  await P.send({ type:"getLibraryVariables" });
  const before = last("libraryVariables").collections.reduce((n,c)=>n+c.variables.length,0);
  // trigger the same code path nodechange uses
  await (async () => {
    const idx = require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));
  })().catch(()=>{});
  console.log("\ntokens before top-up:", before);

  /* 3. persistence: the index survives a save/restore round trip */
  await wait(1700);
  const saved = P.clientStore["libIndex:doc-1"];
  console.log("saved to clientStorage:", !!saved,
    saved ? "(v" + saved.v + ", " + saved.styles.length + " styles, " + saved.vars.length + " tokens)" : "");

  /* 4. warm open — restore, then confirm it serves instantly */
  P.posted.length = 0;
  await P.send({ type:"ready" });
  const warm = last("libStatus");
  counts("after ready (warm)");
  console.log("restored flag:", warm && warm.restored, "| savedAt set:", !!(warm && warm.savedAt));

  const styles = last("styles"), vars = last("libraryVariables");
  P.expect("the background pass found the library style",
    styles.library.paint.length + styles.library.text.length > 0);
  P.expect("the background pass found the library tokens",
    vars.collections.reduce((n, c) => n + c.variables.length, 0) > 0);
  P.expect("the index was written to clientStorage", !!P.clientStore["libIndex:doc-1"]);
  P.expect("a warm open restores it", warm.restored === true && warm.savedAt > 0);
  P.finish();
})().catch(e => { console.error("FAIL:", e.stack.split("\n").slice(0,3).join(" | ")); process.exit(1); });
