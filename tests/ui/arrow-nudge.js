/*
 * The arrows move the selection when no field is holding them.
 *
 * The report: type a value, press Enter, reach for the arrows to nudge the layer —
 * and nothing happens until the canvas is clicked. Nothing can hand the keyboard
 * back to Figma: the panel is an iframe, and once it has the focus it keeps it
 * until something outside is clicked. `window.blur()` does not do it and there is
 * no API for it.
 *
 * So the panel answers the arrows itself and moves the selection the way the canvas
 * would. Enter already lets go of the field, which is what makes the reported
 * sequence work: value, Enter, arrows.
 *
 * Three things must not be taken over: a field is having its own conversation with
 * the arrows (it steps its value), the tree walks itself with them, and a popover
 * is modal.
 */
const { w, errors, sent, post, check, expect } = require("../harness/ui.js");
const D = w.document;

const field = (key) => D.querySelector('#insp-body [data-key="' + key + '"] input');
const nudges = () => sent.filter((m) => m.type === "nudge");
const last = () => nudges()[nudges().length - 1];

function arrow(target, key, shift) {
  const e = new w.KeyboardEvent("keydown", { key: key, shiftKey: !!shift, bubbles: true, cancelable: true });
  (target || D.body).dispatchEvent(e);
  return e;
}

function props(id) {
  post({ type: "props", count: 1, inspected: 1, ids: [id], types: ["FRAME"], refs: {}, bbox: null,
    props: { id: id, name: "Card", type: "FRAME", visible: true, locked: false,
      x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1, blendMode: "NORMAL",
      constraints: { horizontal: "MIN", vertical: "MIN" }, inAutoLayout: false,
      layoutSizingHorizontal: null, layoutSizingVertical: null, layoutPositioning: null,
      layoutMode: "NONE", clipsContent: true, cornerRadius: 0,
      fills: [], fillStyleId: "", strokes: [], strokeStyleId: "", strokeWeight: 0,
      strokeAlign: "CENTER", dashPattern: "", strokeSides: { top: null }, effects: [],
      effectStyleId: "", exportSettings: [], boundVariables: {}, childCount: 0 } });
}

post({ type: "pages", pages: [{ id: "0:1", name: "Page 1" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: ["2:1"],
  rows: [{ id: "2:1", name: "Card", type: "FRAME", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false }] });
props("2:1");
check("render");

/* ---- the reported sequence: value, Enter, arrows ---- */
const rot = field("rotation");
rot.focus();
rot.value = "130";
rot.dispatchEvent(new w.Event("input", { bubbles: true }));
rot.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
console.log("after Enter the focus is on", D.activeElement && D.activeElement.tagName);
expect("Enter lets go of the field", D.activeElement !== rot);

sent.length = 0;
arrow(D.activeElement, "ArrowRight");
console.log("→ sent:", JSON.stringify(last()));
expect("the arrow moves the selection, with no click on the canvas in between",
  nudges().length === 1);
expect("one pixel to the right", last().dx === 1 && last().dy === 0);

/* ---- the four directions, and shift ---- */
sent.length = 0;
arrow(D.body, "ArrowLeft");
arrow(D.body, "ArrowUp");
arrow(D.body, "ArrowDown");
console.log("← ↑ ↓ ->", JSON.stringify(nudges().map(m => m.dx + "," + m.dy)));
expect("left is negative x", nudges()[0].dx === -1 && nudges()[0].dy === 0);
expect("up is negative y", nudges()[1].dy === -1 && nudges()[1].dx === 0);
expect("down is positive y", nudges()[2].dy === 1);

sent.length = 0;
arrow(D.body, "ArrowRight", true);
console.log("shift+→ ->", JSON.stringify(last()));
expect("shift is the big nudge", last().dx === 10);

/* the panel must not also scroll */
const ev = arrow(D.body, "ArrowDown");
expect("and the key is taken, so the panel does not scroll under it", ev.defaultPrevented);

/* ---- what the arrows belong to instead ---- */
sent.length = 0;
const x = field("x");
x.focus();
arrow(x, "ArrowUp");
console.log("in a field -> nudges:", nudges().length,
  "| the field stepped to", x.value);
expect("a field keeps the arrows for its own value", nudges().length === 0);
expect("and steps", x.value === "1");
x.dispatchEvent(new w.KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true }));
x.blur();

sent.length = 0;
const tree = D.getElementById("tree");
tree.focus();
arrow(tree, "ArrowDown");
console.log("in the tree -> nudges:", nudges().length);
expect("the tree walks itself with the arrows", nudges().length === 0);
D.body.focus();

sent.length = 0;
D.querySelector(".sec .prow .sw") ? null : null;
D.getElementById("btn-panels").click();          /* any popover will do */
arrow(D.body, "ArrowRight");
console.log("with a popover open -> nudges:", nudges().length);
expect("a popover is modal, the arrows do not reach past it", nudges().length === 0);
D.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));

/* ---- nothing selected, nothing to nudge ---- */
sent.length = 0;
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: [],
  rows: [{ id: "2:1", name: "Card", type: "FRAME", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false }] });
arrow(D.body, "ArrowRight");
console.log("nothing selected -> nudges:", nudges().length);
expect("with nothing selected the arrows are left alone", nudges().length === 0);

/* ---- a modifier means something else entirely ---- */
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: ["2:1"],
  rows: [{ id: "2:1", name: "Card", type: "FRAME", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false }] });
sent.length = 0;
D.body.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", metaKey: true, bubbles: true, cancelable: true }));
D.body.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true, cancelable: true }));
console.log("⌘→ and ⌥→ ->", nudges().length, "nudges");
expect("a modified arrow is not a nudge", nudges().length === 0);
check("nudging");

console.log("\nERRORS:", errors.length ? errors : "(none)");
