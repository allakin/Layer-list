/*
 * The Scale panel's one operation.
 *
 * rescale() is the Scale tool, not resize(): strokes, corner radii and font
 * sizes go with the geometry. It scales from the node's own origin and leaves x
 * and y alone, so every anchor other than the top left is a move afterwards —
 * and with more than one layer selected the anchor is a point on the box around
 * all of them, which is what makes the gaps between them scale too.
 *
 * Three things here are easy to get wrong and are each worth a test:
 *   - the point rescale() holds still is the node's origin, which is the
 *     translation in its absolute transform, not the corner of its bounding box;
 *   - x and y are measured inside the parent, so a move measured on the canvas
 *     has to be converted before it is written, or a rotated frame sends the
 *     layer sideways;
 *   - a layer inside another selected layer is already being scaled by it.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

/* A node that knows how big it is and where it is, and can be rescaled. */
function box(o) {
  const n = Object.assign({
    type: "RECTANGLE", rotation: 0, visible: true, locked: false, opacity: 1,
    blendMode: "NORMAL", fills: [], strokes: [], effects: [], exportSettings: [],
    boundVariables: {}, constraints: { horizontal: "MIN", vertical: "MIN" },
    strokeWeight: 2, cornerRadius: 8
  }, o);
  n.rescale = function (s) {
    if (s < 0.01) throw new Error("rescale: scale must be >= 0.01");
    n.width *= s; n.height *= s;
    n.strokeWeight *= s; n.cornerRadius *= s;    // the point of the Scale tool
    n.scaled = (n.scaled || 1) * s;
  };
  if (!n.absoluteBoundingBox) {
    Object.defineProperty(n, "absoluteBoundingBox", {
      get() { return { x: n.x, y: n.y, width: n.width, height: n.height }; }
    });
  }
  if (!n.absoluteTransform) {
    Object.defineProperty(n, "absoluteTransform", {
      get() { return [[1, 0, n.x], [0, 1, n.y]]; }
    });
  }
  return n;
}

const one = box({ id: "one", name: "Card", x: 100, y: 50, width: 200, height: 100 });
const a = box({ id: "a", name: "A", x: 0, y: 0, width: 100, height: 100 });
const b = box({ id: "b", name: "B", x: 300, y: 0, width: 100, height: 100 });

/* inside a frame turned a quarter: x and y no longer point where the canvas does */
const turned = box({
  id: "turned", name: "In a rotated frame", x: 100, y: 0, width: 50, height: 50,
  absoluteBoundingBox: { x: 0, y: 100, width: 50, height: 50 },
  absoluteTransform: [[0, -1, 0], [1, 0, 100]]
});
const rotatedFrame = P.mkNode({
  id: "rot", name: "Rotated", type: "FRAME", layoutMode: "NONE", rotation: 90,
  x: 0, y: 0, width: 200, height: 200, fills: [], strokes: [], effects: [],
  absoluteTransform: [[0, -1, 0], [1, 0, 0]], children: [turned]
});

/* auto layout owns x and y of its children */
const stackChild = box({ id: "stacked", name: "Row item", x: 0, y: 0, width: 40, height: 40 });
const stack = P.mkNode({
  id: "stack", name: "Stack", type: "FRAME", layoutMode: "VERTICAL", itemSpacing: 8,
  x: 0, y: 400, width: 100, height: 100, fills: [], strokes: [], effects: [],
  children: [stackChild]
});

/* a parent and its child selected together */
const inner = box({ id: "inner", name: "Inner", x: 10, y: 10, width: 50, height: 50 });
const outer = P.mkNode({
  id: "outer", name: "Outer", type: "FRAME", layoutMode: "NONE",
  x: 0, y: 600, width: 200, height: 200, fills: [], strokes: [], effects: [],
  children: [inner]
});
outer.rescale = function (s) { outer.width *= s; outer.height *= s; outer.scaled = (outer.scaled || 1) * s; };
Object.defineProperty(outer, "absoluteBoundingBox", {
  get() { return { x: outer.x, y: outer.y, width: outer.width, height: outer.height }; }
});
Object.defineProperty(outer, "absoluteTransform", { get() { return [[1, 0, outer.x], [0, 1, outer.y]]; } });

/* a layer with no rescale at all */
const slice = P.mkNode({ id: "sec", name: "A section", type: "SECTION", x: 0, y: 900, width: 10, height: 10,
  fills: [], strokes: [], effects: [] });

const page = P.mkNode({ id: "page", name: "Page 1", type: "PAGE",
  children: [one, a, b, rotatedFrame, stack, outer, slice] });
page.selection = []; page.on = () => {}; page.off = () => {};
page.loadAsync = async () => {}; page.findAll = () => [];
f.root.children = [page]; f.currentPage = page;

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const scale = (factor, anchor) =>
  P.send({ type: "update", key: "scale", value: { factor: factor, anchor: anchor }, commit: true });
const at = (n) => Math.round(n.x) + "," + Math.round(n.y);
const size = (n) => Math.round(n.width) + "x" + Math.round(n.height);
const notes = () => P.posted.filter((m) => m.notify).map((m) => m.notify);

(async () => {
  /* ---- one layer, anchored in the middle ---- */
  page.selection = [one];
  await scale(2, "cc");
  console.log("200x100 at 100,50 scaled 2x from the centre ->", size(one), "at", at(one));
  P.expect("the layer is twice the size", size(one) === "400x200");
  P.expect("its stroke and radius went with it", one.strokeWeight === 4 && one.cornerRadius === 16);
  // centre was (200,100); at 2x the 200x100 box grows to 400x200, so the top
  // left has to move back by half of what was added
  P.expect("the centre of it stayed where it was", at(one) === "0,0");

  /* ---- the anchor is the point that does not move ---- */
  page.selection = [one];
  await scale(0.5, "tl");
  console.log("halved from the top left ->", size(one), "at", at(one));
  P.expect("halving is a scale like any other", size(one) === "200x100");
  P.expect("anchored top left, x and y are left alone", at(one) === "0,0");

  page.selection = [one];
  await scale(0.5, "br");
  console.log("halved from the bottom right ->", size(one), "at", at(one));
  P.expect("anchored bottom right, the far corner is what holds",
    size(one) === "100x50" && at(one) === "100,50");

  /* ---- more than one: the gap between them scales too ---- */
  page.selection = [a, b];
  await scale(2, "tl");
  console.log("two 100px squares 200px apart, 2x from the top left:",
    "A", at(a), size(a), "| B", at(b), size(b));
  P.expect("both are twice the size", size(a) === "200x200" && size(b) === "200x200");
  P.expect("the first is where the anchor is", at(a) === "0,0");
  P.expect("the second moved out with the gap", at(b) === "600,0");

  /* ---- inside a rotated frame ---- */
  page.selection = [turned];
  await scale(2, "br");
  console.log("in a frame turned 90°, 2x from the bottom right ->", at(turned), size(turned));
  P.expect("the layer scaled", size(turned) === "100x100");
  // the move is 50 left and 50 up on the canvas; inside a frame turned a
  // quarter that is -50 on x and +50 on y
  P.expect("the move was converted into the parent's own axes", at(turned) === "50,50");

  /* ---- auto layout owns the position ---- */
  page.selection = [stackChild];
  await scale(2, "cc");
  console.log("an auto-layout child ->", size(stackChild), "at", at(stackChild));
  P.expect("it still scales", size(stackChild) === "80x80");
  P.expect("but nothing tries to move it", at(stackChild) === "0,0");

  /* ---- a parent and its child selected together ---- */
  page.selection = [outer, inner];
  await scale(2, "tl");
  console.log("frame and its child selected together ->",
    "outer x" + outer.scaled, "inner x" + (inner.scaled || 1));
  P.expect("the frame scaled", outer.scaled === 2);
  P.expect("the child was left to the frame, not scaled twice", !inner.scaled);

  /* ---- what cannot be scaled is reported, not silently dropped ---- */
  P.posted.length = 0;
  page.selection = [slice];
  await scale(2, "cc");
  console.log("selecting only a layer that cannot scale says:", JSON.stringify(notes()));
  P.expect("it says so rather than doing nothing quietly", notes().length === 1);

  P.posted.length = 0;
  page.selection = [a, slice];
  await scale(2, "tl");
  console.log("one of two cannot scale:", JSON.stringify(notes()), "| A is", size(a));
  P.expect("the ones that can still scale", size(a) === "400x400");
  P.expect("and the one that cannot is mentioned",
    notes().length === 1 && /cannot be scaled/.test(notes()[0]));

  /* ---- factors that make no sense ---- */
  P.posted.length = 0;
  page.selection = [a];
  const was = size(a);
  await scale(0, "cc");
  await scale(-2, "cc");
  await scale(1000, "cc");
  await scale(NaN, "cc");
  console.log("0, -2, 1000 and NaN ->", size(a), "| said:", JSON.stringify(notes()));
  P.expect("none of them touched the layer", size(a) === was);
  P.expect("each of them said why", notes().length === 4);

  P.posted.length = 0;
  await scale(1, "cc");
  P.expect("1x is not an edit and says nothing", size(a) === was && notes().length === 0);

  /* ---- what the panel reads the numbers from ---- */
  P.posted.length = 0;
  page.selection = [one];
  await P.send({ type: "refresh" });
  await new Promise((r) => setTimeout(r, 30));
  let props = P.posted.filter((m) => m.type === "props").pop();
  console.log("one layer selected, bbox:", JSON.stringify(props.bbox));
  P.expect("one layer reads as its own size, like the Design panel",
    props.bbox.single === true && props.bbox.w === one.width && props.bbox.h === one.height);

  P.posted.length = 0;
  page.selection = [a, b];
  await P.send({ type: "refresh" });
  await new Promise((r) => setTimeout(r, 30));
  props = P.posted.filter((m) => m.type === "props").pop();
  console.log("two layers selected, bbox:", JSON.stringify(props.bbox));
  P.expect("several read as the box around them",
    props.bbox.single === false && props.bbox.w === (b.x + b.width - a.x));

  P.finish();
})().catch((e) => { console.error("FAIL:", e.stack); process.exit(1); });
