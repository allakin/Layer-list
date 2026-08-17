/*
 * Align, distribute and tidy up on layers that are rotated, and on selections
 * spanning more than one parent.
 *
 * The report, with its own numbers: a layer 85×16 turned 90°, inside a frame 70
 * wide. "Centre horizontally" put it at **x = -7.5** — outside the frame, hard
 * against its left edge — where Figma's own panel centres it properly.
 *
 * -7.5 is (70 - 85) / 2. The layer is 85 wide *before* it is rotated; what it
 * occupies is 16. And x is not its left edge either: it is the corner the rotation
 * turns around, which for a quarter turn ends up on the layer's right. Aligning by
 * x/y/width/height is aligning a rectangle that is not on screen.
 *
 * The other half of the same fault: x and y are offsets inside the parent, so
 * comparing them across two different parents compares two different origins. A
 * selection spanning parents has only the canvas in common.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

/*
 * A node whose relativeTransform follows from x, y and rotation, the way Figma's
 * does. A quarter turn maps the layer's own (x, y) to (-y, x), so its corners land
 * left of and below the origin — which is the whole point of the bug.
 */
function node(o) {
  const n = Object.assign({
    type: "RECTANGLE", rotation: 0, visible: true, locked: false, opacity: 1,
    blendMode: "NORMAL", fills: [], strokes: [], effects: [], exportSettings: [],
    boundVariables: {}, constraints: { horizontal: "MIN", vertical: "MIN" }
  }, o);
  Object.defineProperty(n, "relativeTransform", {
    get() {
      const r = (n.rotation || 0) * Math.PI / 180;
      const cos = Math.round(Math.cos(r) * 1e12) / 1e12;
      const sin = Math.round(Math.sin(r) * 1e12) / 1e12;
      // Figma's y axis points down and rotation is anticlockwise on screen.
      return [[cos, sin, n.x], [-sin, cos, n.y]];
    }
  });
  Object.defineProperty(n, "absoluteTransform", {
    get() {
      const t = n.relativeTransform;
      const p = n.parent && n.parent.absoluteTransform;
      if (!p) return t;
      return [[t[0][0], t[0][1], t[0][2] + p[0][2]], [t[1][0], t[1][1], t[1][2] + p[1][2]]];
    }
  });
  Object.defineProperty(n, "absoluteBoundingBox", {
    get() {
      const t = n.absoluteTransform;
      const pts = [[0, 0], [n.width, 0], [n.width, n.height], [0, n.height]].map((q) => [
        t[0][0] * q[0] + t[0][1] * q[1] + t[0][2],
        t[1][0] * q[0] + t[1][1] * q[1] + t[1][2]
      ]);
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      return { x: Math.min(...xs), y: Math.min(...ys),
               width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    }
  });
  return n;
}

/* The reported case: 85×16 turned 90°, in a frame 70 wide. */
const turned = node({ id: "turned", name: "Frame 208732695", x: 0, y: 73, width: 85, height: 16, rotation: 90 });
const upright = node({ id: "upright", name: "Not turned", x: 5, y: 5, width: 20, height: 10 });
const shell = P.mkNode({
  id: "shell", name: "Шапка", type: "FRAME", layoutMode: "NONE",
  x: 100, y: 200, width: 70, height: 200, fills: [], strokes: [], effects: [],
  children: [turned, upright]
});
Object.defineProperty(shell, "absoluteTransform", { get() { return [[1, 0, shell.x], [0, 1, shell.y]]; } });

/* two layers in two different frames, for the parent-spanning case */
const inA = node({ id: "inA", name: "In A", x: 10, y: 10, width: 40, height: 20 });
const inB = node({ id: "inB", name: "In B", x: 10, y: 60, width: 40, height: 20 });
const frameA = P.mkNode({ id: "fA", name: "A", type: "FRAME", layoutMode: "NONE",
  x: 0, y: 0, width: 200, height: 200, fills: [], strokes: [], effects: [], children: [inA] });
const frameB = P.mkNode({ id: "fB", name: "B", type: "FRAME", layoutMode: "NONE",
  x: 500, y: 0, width: 200, height: 200, fills: [], strokes: [], effects: [], children: [inB] });
Object.defineProperty(frameA, "absoluteTransform", { get() { return [[1, 0, frameA.x], [0, 1, frameA.y]]; } });
Object.defineProperty(frameB, "absoluteTransform", { get() { return [[1, 0, frameB.x], [0, 1, frameB.y]]; } });

const page = P.mkNode({ id: "page", name: "Page 1", type: "PAGE", children: [shell, frameA, frameB] });
page.selection = []; page.on = () => {}; page.off = () => {};
page.loadAsync = async () => {}; page.findAll = () => [];
f.root.children = [page]; f.currentPage = page;

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const align = (mode) => P.send({ type: "update", key: "align", value: mode, commit: true });
const round = (v) => Math.round(v * 100) / 100;
/* what the layer occupies in its parent, which is what the eye sees */
function seen(n) {
  const b = n.absoluteBoundingBox, p = n.parent.absoluteTransform;
  return { left: round(b.x - p[0][2]), top: round(b.y - p[1][2]), w: round(b.width), h: round(b.height) };
}

(async () => {
  console.log("the turned layer: x =", turned.x, "· width =", turned.width,
    "· occupies", JSON.stringify(seen(turned)));
  P.expect("85 wide and turned 90°, it occupies 16", seen(turned).w === 16);

  /* ---- the reported case ---- */
  page.selection = [turned];
  await align("centerH");
  console.log("centre horizontally in a 70-wide frame -> x =", round(turned.x),
    "· occupies", JSON.stringify(seen(turned)));
  P.expect("the layer is centred on what it occupies, not on its unrotated width",
    seen(turned).left === (70 - 16) / 2);
  P.expect("the same amount of frame is left on either side",
    seen(turned).left === round(70 - seen(turned).left - seen(turned).w));
  /* the old formula, spelled out, so the number from the report cannot come back */
  P.expect("not (70 - 85) / 2, which is where it used to go",
    round(turned.x) !== -7.5 && seen(turned).left !== -7.5);

  await align("left");
  console.log("left -> occupies", JSON.stringify(seen(turned)));
  P.expect("flush left means its edge on the frame's edge", seen(turned).left === 0);

  await align("right");
  console.log("right -> occupies", JSON.stringify(seen(turned)));
  P.expect("flush right, likewise", seen(turned).left === 70 - 16);

  await align("centerV");
  console.log("centre vertically -> occupies", JSON.stringify(seen(turned)));
  P.expect("the vertical centre uses the 85 it occupies downwards",
    seen(turned).top === round((200 - 85) / 2));

  /* ---- a layer that is not rotated behaves exactly as before ---- */
  page.selection = [upright];
  await align("centerH");
  await align("centerV");
  console.log("an upright layer ->", JSON.stringify(seen(upright)), "x/y:", upright.x, upright.y);
  P.expect("nothing changed for the simple case",
    upright.x === (70 - 20) / 2 && upright.y === (200 - 10) / 2);

  /* ---- rotated and upright together, aligned to each other ----
     Aligned right, the two widths part company: 16 is what the turned layer
     occupies, 85 is what it reports. */
  turned.x = 0; turned.y = 73; upright.x = 40; upright.y = 5;
  page.selection = [turned, upright];
  await align("right");
  const tRight = round(seen(turned).left + seen(turned).w);
  const uRight = round(seen(upright).left + seen(upright).w);
  console.log("two layers, right ->", JSON.stringify(seen(turned)), JSON.stringify(seen(upright)));
  P.expect("both end on the same right edge", tRight === uRight);
  P.expect("and it is the rightmost of the two as they were", tRight === 60);

  /* ---- the case that can only come from the transform ----
     Turned 180°, the layer's origin ends up at the *far* corner of its box: x is
     85 to the right of what the eye calls its left edge. Anything reading x as
     "left" gets this one wrong however it handles the width. */
  const flipped = node({ id: "flipped", name: "Upside down", x: 60, y: 100, width: 85, height: 16, rotation: 180 });
  shell.children.push(flipped); flipped.parent = shell; P.nodesById.set("flipped", flipped);
  console.log("turned 180°: x =", flipped.x, "· occupies", JSON.stringify(seen(flipped)));
  P.expect("its origin is not its left edge", seen(flipped).left === flipped.x - 85);
  page.selection = [flipped];
  await align("left");
  console.log("left -> x =", flipped.x, "· occupies", JSON.stringify(seen(flipped)));
  P.expect("aligning left moves the edge to 0, whatever x has to become",
    seen(flipped).left === 0 && flipped.x === 85);

  /* ---- a selection spanning two parents ---- */
  page.selection = [inA, inB];
  await align("top");
  const aTop = inA.absoluteBoundingBox.y, bTop = inB.absoluteBoundingBox.y;
  console.log("across two frames, top -> absolute tops:", aTop, bTop,
    "| x/y kept in their own parents:", inA.y, inB.y);
  P.expect("they line up on the canvas, which is the only space they share",
    round(aTop) === round(bTop));
  P.expect("the one that had to move did so in its own parent's coordinates",
    inB.y === 10 && inA.y === 10);
  P.expect("and neither was dragged into the other's coordinate space",
    inA.parent.id === "fA" && inB.parent.id === "fB");

  /* ---- distribute, with a rotated layer in the mix ---- */
  const r1 = node({ id: "r1", name: "r1", x: 0, y: 0, width: 20, height: 20 });
  const r2 = node({ id: "r2", name: "r2", x: 40, y: 0, width: 85, height: 16, rotation: 90 });
  const r3 = node({ id: "r3", name: "r3", x: 200, y: 0, width: 20, height: 20 });
  const row = P.mkNode({ id: "row", name: "Row", type: "FRAME", layoutMode: "NONE",
    x: 0, y: 600, width: 400, height: 200, fills: [], strokes: [], effects: [],
    children: [r1, r2, r3] });
  Object.defineProperty(row, "absoluteTransform", { get() { return [[1, 0, row.x], [0, 1, row.y]]; } });
  page.children.push(row);
  [r1, r2, r3].forEach((n) => P.nodesById.set(n.id, n));

  page.selection = [r1, r2, r3];
  await P.send({ type: "update", key: "distribute", value: "h", commit: true });
  const boxes = [r1, r2, r3].map(seen).sort((a, b) => a.left - b.left);
  const gaps = [round(boxes[1].left - (boxes[0].left + boxes[0].w)),
                round(boxes[2].left - (boxes[1].left + boxes[1].w))];
  console.log("distributed:", JSON.stringify(boxes), "| gaps:", JSON.stringify(gaps));
  P.expect("the gaps between what the layers occupy are equal",
    Math.abs(gaps[0] - gaps[1]) < 0.01);
  P.expect("and the outermost two did not move",
    boxes[0].left === 0 && round(boxes[2].left + boxes[2].w) === 220);

  P.finish();
})().catch((e) => { console.error("FAIL:", e.stack); process.exit(1); });
