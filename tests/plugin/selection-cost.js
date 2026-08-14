/*
 * "The plugin lags when I select something."
 *
 * Selecting used to cost, immediately and on the editor's own thread: reveal,
 * re-list, read the props, walk the whole selected subtree for the colour strip,
 * and walk it again six levels deep for the token index — one lookup per style id
 * found. On a page of screen mockups that is tens of thousands of node reads, and
 * a marquee repeats all of it on every pointer move.
 *
 * So: one coalesced pass per burst, and both walks bounded.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

let fillReads = 0;
let styleLookups = 0;

/* Every node answers a distinct style id, so an unbounded harvest would queue one
   round trip per node in the tree. */
function leaf(id) {
  const n = { id: id, name: id, type: "RECTANGLE", fillStyleId: "S:" + id, boundVariables: {} };
  Object.defineProperty(n, "fills", {
    get() { fillReads++; return [{ type: "SOLID", visible: true, color: { r: 1, g: 0.5, b: 0 } }]; },
    enumerable: true
  });
  return n;
}

function frame(id, kids) {
  const n = {
    id: id, name: id, type: "FRAME", layoutMode: "NONE", fillStyleId: "S:" + id,
    visible: true, locked: false, x: 0, y: 0, width: 800, height: 600, rotation: 0,
    opacity: 1, blendMode: "PASS_THROUGH", strokes: [], effects: [], exportSettings: [],
    constraints: { horizontal: "MIN", vertical: "MIN" }, boundVariables: {}, children: kids
  };
  Object.defineProperty(n, "fills", {
    get() { fillReads++; return [{ type: "SOLID", visible: true, color: { r: 1, g: 1, b: 1 } }]; },
    enumerable: true
  });
  return n;
}

/* 3 × 30 × 60 ≈ 5 500 nodes — the size of a few screens with their contents */
const tops = [];
for (let t = 0; t < 3; t++) {
  const mid = [];
  for (let m = 0; m < 30; m++) {
    const leaves = [];
    for (let l = 0; l < 60; l++) leaves.push(leaf("n" + t + "-" + m + "-" + l));
    mid.push(frame("m" + t + "-" + m, leaves));
  }
  tops.push(P.mkNode(frame("вариант " + (60 + t), mid)));
}
const TOTAL = 3 * (1 + 30 * (1 + 60));

const page = P.mkNode({ id: "page", name: "В работе", type: "PAGE", children: tops });
page.on = () => {}; page.off = () => {};
page.loadAsync = async () => {}; page.findAll = () => []; page.findAllWithCriteria = () => [];
page.selection = [];
f.root.children = [page]; f.root.id = "doc-selection-cost";
f.currentPage = page;
f.getStyleByIdAsync = async (id) => { styleLookups++; return null; };

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await wait(120);                        // let the boot pushes land
  P.posted.length = 0;
  fillReads = 0; styleLookups = 0;

  /* a marquee across two of the frames: one event per pointer move */
  page.selection = [tops[0], tops[1]];
  for (let i = 0; i < 12; i++) P.events.selectionchange();

  await wait(160);                        // past the 90 ms refresh window
  const layerPushes = P.posted.filter((m) => m.type === "layers").length;
  const propPushes = P.posted.filter((m) => m.type === "props").length;
  await wait(500);                        // past the 400 ms index window

  const props = P.posted.filter((m) => m.type === "props").pop();
  console.log("tree               : " + TOTAL + " nodes, 2 of 3 top frames selected");
  console.log("12 selection events → layers pushes: " + layerPushes + ", props pushes: " + propPushes);
  console.log("fill reads         : " + fillReads + "  (one per node the colour walk touched)");
  console.log("style lookups      : " + styleLookups + "  (one per id the index harvest found)");
  console.log("colour strip       : " + (props && props.colors ? props.colors.length + " colours" : "(none)"));

  P.expect("a burst of selection events lists the layers once", layerPushes === 1);
  P.expect("and reads the properties once", propPushes === 1);
  P.expect("the colour walk stays bounded", fillReads > 0 && fillReads < TOTAL / 2);
  P.expect("the token harvest stays bounded", styleLookups > 0 && styleLookups <= 520);
  P.expect("the colour strip is still filled in", !!props && !!props.colors && props.colors.length > 0);
  P.expect("both frames are still in the payload", !!props && props.count === 2);

  P.finish();
})().catch((e) => {
  console.error("FAIL:", e.stack.split("\n").slice(0, 3).join(" | "));
  process.exit(1);
});
