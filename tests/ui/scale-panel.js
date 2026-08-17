/*
 * The Scale pane: a width, a height, a multiplier and an anchor.
 *
 * All four are one number in the end — rescale() takes a single uniform factor —
 * so what this checks is that each control names the same factor correctly, and
 * that the anchor the user picked travels with it.
 *
 * None of these fields scrub. Every commit changes the size the next one would be
 * measured against, so a live drag would compound instead of scaling once: 200 ->
 * 400 -> 800 while the pointer is still moving.
 */
const { w, errors, sent, post, check, expect } = require("../harness/ui.js");
const D = w.document;

const $ = (id) => D.getElementById(id);
const click = (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
const pop = () => D.querySelector("#pop-layer .pop");
const closePop = () => $("pop-layer").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
const pane = () => $("scale-pane");
const fieldFor = (key) => pane().querySelector('[data-key="' + key + '"] input');
const scales = () => sent.filter((m) => m.type === "update" && m.key === "scale");
const lastScale = () => scales()[scales().length - 1];

/*
 * Enter is not the only thing a commit rides on: it commits and then blurs, and
 * blur commits too. So typing is done here the way a person does it — the field
 * gets an `input` event, then Enter, then the blur that Enter causes — because
 * anything less would not have caught one Enter arriving as two edits.
 */
function type(input, value) {
  input.value = value;
  input.dispatchEvent(new w.Event("input", { bubbles: true }));
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  input.dispatchEvent(new w.Event("blur"));
}

function select(count, bbox) {
  post({ type: "props", count: count, inspected: count, ids: ["2:1"], types: ["FRAME"], refs: {},
    bbox: bbox,
    props: { id: "2:1", name: "Hero", type: "FRAME", visible: true, locked: false,
      x: 0, y: 0, width: 789, height: 468, rotation: 0, opacity: 1, blendMode: "NORMAL",
      constraints: { horizontal: "MIN", vertical: "MIN" }, inAutoLayout: false,
      layoutSizingHorizontal: null, layoutSizingVertical: null, layoutPositioning: null,
      layoutMode: "NONE", clipsContent: true, cornerRadius: 0,
      fills: [], fillStyleId: "", strokes: [], strokeStyleId: "", strokeWeight: 0,
      strokeAlign: "CENTER", dashPattern: "", strokeSides: { top: null }, effects: [],
      effectStyleId: "", exportSettings: [], boundVariables: {}, childCount: 0 } });
}

post({ type: "pages", pages: [{ id: "0:1", name: "Page 1" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: ["2:1"],
  rows: [{ id: "2:1", name: "Hero", type: "FRAME", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false }] });
check("render");

/* ---- nothing selected ---- */
console.log("with no selection:", pane().textContent.trim());
expect("the pane is there before anything is selected", !!pane().querySelector(".sec"));
expect("and says what it needs", /Select a layer to scale/.test(pane().textContent));

/* ---- the numbers from the screenshot ---- */
select(1, { w: 789, h: 468, single: true });
console.log("W:", fieldFor("scale-w").value, "| H:", fieldFor("scale-h").value,
  "| scale:", fieldFor("scale-x").value);
expect("the width of the selection shows", fieldFor("scale-w").value === "789");
expect("so does the height", fieldFor("scale-h").value === "468");
expect("the multiplier starts at 1", fieldFor("scale-x").value === "1");
expect("and says what unit it is in",
  pane().querySelector('[data-key="scale-x"] .unit').textContent === "x");

expect("neither size field scrubs, because each commit moves the baseline",
  [...pane().querySelectorAll(".fld .k")].every(k => k.classList.contains("noscrub")));

/* ---- a target width is a factor ---- */
sent.length = 0;
type(fieldFor("scale-w"), "1578");
console.log("typed W 1578 ->", JSON.stringify(lastScale()));
/* One Enter, one edit. It used to be two — Enter commits and then blurs, and the
   blur commits again — which for a factor of 2 meant the layer came out 4x. */
expect("typing a width scales the selection exactly once", scales().length === 1);
expect("by the factor that gets there", Math.abs(lastScale().value.factor - 2) < 1e-9);
expect("anchored where the grid says", lastScale().value.anchor === "cc");

/* Every edit ends in a props push, which is where the fields get their values
   from — so that is how the number the user asked for reaches the screen. */
select(1, { w: 1578, h: 936, single: true });
console.log("after the document answered:", fieldFor("scale-w").value + "x" + fieldFor("scale-h").value,
  "| multiplier:", fieldFor("scale-x").value);
expect("the new size shows", fieldFor("scale-w").value === "1578");
expect("and the multiplier shows what the edit came to", fieldFor("scale-x").value === "2");

sent.length = 0;
type(fieldFor("scale-h"), "468");
console.log("typed H 468 ->", JSON.stringify(lastScale().value));
expect("typing a height scales it too, once", scales().length === 1);
expect("by the factor that gets there", Math.abs(lastScale().value.factor - 0.5) < 1e-9);
select(1, { w: 789, h: 468, single: true });

/* the same width is not an edit */
sent.length = 0;
type(fieldFor("scale-w"), "789");
console.log("re-typing the width it already has sent:", scales().length, "edits");
expect("a width that changes nothing is not an edit", scales().length === 0);

/* clicking away rather than pressing Enter is also exactly one edit */
sent.length = 0;
let wIn = fieldFor("scale-w");
wIn.value = "1578";
wIn.dispatchEvent(new w.Event("input", { bubbles: true }));
wIn.dispatchEvent(new w.Event("blur"));
console.log("blurred without Enter ->", scales().length, "edit(s)");
expect("leaving the field commits it, once", scales().length === 1);
select(1, { w: 789, h: 468, single: true });

/* ---- the multiplier, however it is written ---- */
/* evalExpr keeps the digits and drops the rest, so the "x" can be typed or not. */
[["2", 2], ["2x", 2], ["0.5", 0.5], ["1.5", 1.5], ["10", 10]].forEach(function (pair) {
  sent.length = 0;
  type(fieldFor("scale-x"), pair[0]);
  const got = lastScale() && lastScale().value.factor;
  console.log("  " + pair[0] + " -> " + got);
  expect('"' + pair[0] + '" means ' + pair[1] + "x", Math.abs(got - pair[1]) < 1e-9);
  expect("and it is sent once, not twice", scales().length === 1);
});

/* Something that is not a number at all: nothing applied, and the field goes back
   to what it was showing. The trap is the restoring itself — the blur that Enter
   causes would commit the restored text as though it had been typed, and for a
   factor that means scaling by whatever was there before. */
select(1, { w: 789, h: 468, single: true });
const shown = fieldFor("scale-x").value;
sent.length = 0;
type(fieldFor("scale-x"), "nonsense");
console.log("nonsense ->", scales().length, "edits | field shows:", fieldFor("scale-x").value);
expect("a multiplier that is not a number is not applied", scales().length === 0);
expect("and the field goes back to the number it was showing",
  fieldFor("scale-x").value === shown);

/* Zero is a number, and the API floor is 0.01, so it is clamped like any other
   out-of-range value in this panel rather than refused. */
sent.length = 0;
type(fieldFor("scale-x"), "0");
console.log("zero ->", scales().length, "edit(s) of", lastScale() && lastScale().value.factor);
expect("zero is clamped to the smallest scale there is, once",
  scales().length === 1 && lastScale().value.factor === 0.01);

/* ---- presets ---- */
/* back to 1x, which is not an edit and needs no round trip */
sent.length = 0;
type(fieldFor("scale-x"), "1");
console.log("typed 1 ->", scales().length, "edits | field shows:", fieldFor("scale-x").value);
expect("1x is not an edit", scales().length === 0);
expect("and the field settles on it", fieldFor("scale-x").value === "1");

sent.length = 0;
click(pane().querySelector('[data-key="scale-x"] .tail .ib'));
let items = pop() ? [...pop().querySelectorAll(".mi .t")].map(e => e.textContent) : [];
console.log("presets:", items.join(" | "));
expect("the whole range is offered",
  items.join(" ") === "0.25x 0.5x 0.75x 1x 2x 3x 4x 5x 10x");
let ticked = [...pop().querySelectorAll(".mi")]
  .filter(r => r.querySelector(".tick").innerHTML !== "")
  .map(r => r.querySelector(".t").textContent);
console.log("ticked:", JSON.stringify(ticked));
expect("the one it is on is ticked", ticked.length === 1 && ticked[0] === "1x");
click([...pop().querySelectorAll(".mi")][items.indexOf("2x")]);
console.log("picked 2x ->", JSON.stringify(lastScale().value));
expect("picking one applies it", lastScale().value.factor === 2);
closePop();
/* and the number that was picked is on screen, which is the whole point of it
   not snapping back to 1x */
select(1, { w: 1578, h: 936, single: true });
console.log("field after picking from the list:", fieldFor("scale-x").value);
expect("the picked multiplier shows in the field", fieldFor("scale-x").value === "2");
click(pane().querySelector('[data-key="scale-x"] .tail .ib'));
expect("and the list agrees about where it is",
  [...pop().querySelectorAll(".mi")].filter(r => r.querySelector(".tick").innerHTML !== "")
    .map(r => r.querySelector(".t").textContent)[0] === "2x");
closePop();
select(1, { w: 789, h: 468, single: true });

/* ---- the anchor ---- */
select(1, { w: 789, h: 468, single: true });
let cells = () => [...pane().querySelectorAll(".anchor button")];
console.log("anchor cells:", cells().length, "| on:", cells().findIndex(b => b.classList.contains("on")));
expect("nine points to choose from", cells().length === 9);
expect("the centre is the one that starts chosen",
  cells()[4].classList.contains("on") && cells()[4].dataset.anchor === "cc");

sent.length = 0;
click(cells()[0]);
console.log("picked the top left ->", JSON.stringify(sent.filter(m => m.type === "setPref")));
expect("picking a point marks it", cells()[0].classList.contains("on"));
expect("and unmarks the old one", !cells()[4].classList.contains("on"));
expect("the choice is saved for next time",
  sent.some(m => m.type === "setPref" && m.anchor === "tl"));

sent.length = 0;
type(fieldFor("scale-w"), "1578");
console.log("scaling now ->", JSON.stringify(lastScale().value));
expect("the anchor travels with the edit", lastScale().value.anchor === "tl");

/* a saved anchor comes back */
post({ type: "prefs", theme: "dark", anchor: "br" });
expect("a saved anchor is restored",
  pane().querySelector('.anchor button[data-anchor="br"]').classList.contains("on"));
check("scale controls");

/* ---- more than one layer reads as the box around them ---- */
select(3, { w: 800, h: 400, single: false });
console.log("three layers:", fieldFor("scale-w").value + "x" + fieldFor("scale-h").value,
  "|", pane().querySelector(".scale-hint").textContent);
expect("the box around the selection is what shows", fieldFor("scale-w").value === "800");
expect("and it says the selection scales as one",
  /as one thing/.test(pane().querySelector(".scale-hint").textContent));

/* ---- the pane can be closed from its own header ---- */
sent.length = 0;
click(pane().querySelector(".sec-hd .ib"));
console.log("closed from the header ->", pane().style.display,
  JSON.stringify(sent.filter(m => m.type === "setPref")));
expect("the ✕ switches the panel off", pane().style.display === "none");
expect("which is saved like any other panel",
  sent.some(m => m.type === "setPref" && m.panes && m.panes.scale === false));
expect("and it stops being rendered at all", pane().innerHTML === "");

/* switching it back on brings the numbers with it */
post({ type: "prefs", theme: "dark", panes: { layers: true, design: true, scale: true } });
console.log("back on:", fieldFor("scale-w") && fieldFor("scale-w").value);
expect("the pane comes back with the selection's size",
  !!fieldFor("scale-w") && fieldFor("scale-w").value === "800");
check("closing the pane");

console.log("\nERRORS:", errors.length ? errors : "(none)");
