/*
 * Editing a gradient from the panel: adding, moving, removing, mirroring and
 * turning its stops.
 *
 * Two rules the document side owes the panel:
 *
 *   - stops live in position order, because Figma reads gradientStops in array
 *     order and a stop dragged past its neighbour would otherwise fold the ramp
 *     back on itself. The index the panel sends is the index *before* the sort;
 *     it applies the same sort afterwards, so the two stay in step;
 *   - every one of these operations moves stop *objects*, never rebuilds them
 *     from colours, because a stop can have a variable bound to its colour and
 *     rebuilding it would drop that binding on the floor.
 *
 * Adding a stop used to be sent as an edit of a stop one past the end of the
 * array, which setGradientStop quietly ignored: the panel grew its own copy and
 * the document never heard about it.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

const IDENTITY = [[1, 0, 0], [0, 1, 0]];

function grad(stops, transform) {
  return {
    type: "GRADIENT_LINEAR",
    gradientTransform: transform || IDENTITY,
    gradientStops: stops.map((s) => ({
      color: { r: s.r, g: s.g, b: s.b, a: s.a == null ? 1 : s.a },
      position: s.pos,
      boundVariables: s.varId ? { color: { type: "VARIABLE_ALIAS", id: s.varId } } : {}
    })),
    visible: true, opacity: 1, blendMode: "NORMAL"
  };
}

const rect = P.mkNode({
  id: "1:1", name: "Hero", type: "RECTANGLE",
  x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, blendMode: "NORMAL",
  strokes: [], effects: [], exportSettings: [], boundVariables: {},
  fills: [grad([
    { r: 0, g: 0, b: 0, pos: 0, varId: "V:black" },
    { r: 0.4, g: 0.4, b: 0.4, pos: 1 }
  ])]
});
const page = P.mkNode({ id: "page", name: "Page 1", type: "PAGE", children: [rect] });
page.selection = [rect]; page.on = () => {}; page.off = () => {};
page.loadAsync = async () => {}; page.findAll = () => [];
f.root.children = [page]; f.currentPage = page;

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const stops = () => P.nodesById.get("1:1").fills[0].gradientStops;
const at = () => stops().map((s) => Math.round(s.position * 100));
const hex = () => stops().map((s) => Math.round(s.color.r * 255).toString(16).padStart(2, "0"));
const bound = () => stops().map((s) => (s.boundVariables && s.boundVariables.color ? s.boundVariables.color.id : "-"));
const upd = (key, value, index, extra) =>
  P.send({ type: "update", key: key, value: value, index: index, extra: extra, commit: true });

(async () => {
  /* ---- adding ---- */
  await upd("fill.gradientStopAdd", { pos: 0.5, color: "#808080", a: 0.5 }, 0, 1);
  console.log("after add at 50%:", at().join(" "), "| alphas:", stops().map((s) => s.color.a).join(" "));
  P.expect("the added stop reached the document", stops().length === 3);
  P.expect("it landed where the panel put it", at().join(" ") === "0 50 100");
  P.expect("with the colour and alpha it was given",
    stops()[1].color.r === 0.5019607843137255 && stops()[1].color.a === 0.5);

  await upd("fill.gradientStopAdd", { pos: 0.25, color: "#FFFFFF", a: 1 }, 0, 0);
  console.log("a stop added with a bad index is still sorted in:", at().join(" "));
  P.expect("an out-of-order insertion is sorted, not left where it was put",
    at().join(" ") === "0 25 50 100");

  /* ---- moving, and the reordering that comes with it ---- */
  await upd("fill.gradientStop", { pos: 0.9 }, 0, 1);
  console.log("stop 1 dragged to 90%:", at().join(" "));
  P.expect("a stop dragged past its neighbours changes places with them",
    at().join(" ") === "0 50 90 100");
  P.expect("the position is the one that was sent", stops()[2].position === 0.9);

  await upd("fill.gradientStop", { pos: 2 }, 0, 3);
  P.expect("a position beyond the ramp is clamped to it", stops()[3].position === 1);

  /* ---- what a stop carries with it ---- */
  console.log("bindings after all that moving:", bound().join(" "));
  P.expect("the token bound to a stop's colour moved with the stop",
    bound()[0] === "V:black" && bound().filter((b) => b === "V:black").length === 1);

  await upd("fill.gradientStop", { color: "#FF0000" }, 0, 0);
  P.expect("a colour edit keeps the alpha the stop already had", stops()[0].color.a === 1);
  P.expect("and writes the colour", stops()[0].color.r === 1 && stops()[0].color.g === 0);

  /* ---- removing ---- */
  await upd("fill.gradientStopRemove", null, 0, 1);
  console.log("after removing stop 1:", at().join(" "));
  P.expect("the stop is gone from the document", stops().length === 3);
  await upd("fill.gradientStopRemove", null, 0, 1);
  await upd("fill.gradientStopRemove", null, 0, 1);
  console.log("after two more removals:", at().join(" "), "(2 is the floor)");
  P.expect("a gradient is never left with fewer than two stops", stops().length === 2);

  /* ---- mirroring ---- */
  const before = hex();
  await upd("fill.gradientReverse", null, 0);
  console.log("reversed:", at().join(" "), "| colours:", hex().join(" "), "was:", before.join(" "));
  P.expect("reversing mirrors the positions", at().join(" ") === "0 100");
  P.expect("and the colours come out the other way round",
    hex().join(" ") === before.slice().reverse().join(" "));
  P.expect("the binding is still on its own colour", bound()[1] === "V:black");

  /* ---- turning ---- */
  const t0 = JSON.stringify(P.nodesById.get("1:1").fills[0].gradientTransform);
  await upd("fill.gradientRotate", null, 0);
  const t1 = JSON.stringify(P.nodesById.get("1:1").fills[0].gradientTransform);
  console.log("transform:", t0, "->", t1);
  P.expect("one press turns the gradient", t1 !== t0);
  P.expect("a quarter turn of the identity runs the ramp downwards instead",
    t1 === JSON.stringify([[0, 1, 0], [-1, 0, 1]]));
  await upd("fill.gradientRotate", null, 0);
  await upd("fill.gradientRotate", null, 0);
  await upd("fill.gradientRotate", null, 0);
  const t4 = P.nodesById.get("1:1").fills[0].gradientTransform;
  console.log("four presses:", JSON.stringify(t4));
  P.expect("four come back to exactly where they started",
    t4.flat().every((n, i) => Math.abs(n - IDENTITY.flat()[i]) < 1e-9));

  /* ---- a solid paint must survive being asked to do all of this ---- */
  P.nodesById.get("1:1").fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, visible: true, opacity: 1, blendMode: "NORMAL" }];
  await upd("fill.gradientStopAdd", { pos: 0.5, color: "#000000", a: 1 }, 0, 1);
  await upd("fill.gradientStopRemove", null, 0, 0);
  await upd("fill.gradientReverse", null, 0);
  await upd("fill.gradientRotate", null, 0);
  const solid = P.nodesById.get("1:1").fills[0];
  console.log("solid fill after gradient-only edits:", JSON.stringify(solid.color), solid.type);
  P.expect("none of them touched a solid fill",
    solid.type === "SOLID" && solid.color.r === 1 && !solid.gradientStops);

  P.finish();
})().catch((e) => { console.error("FAIL:", e.stack); process.exit(1); });
