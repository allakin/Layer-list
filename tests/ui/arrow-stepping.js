/*
 * Holding an arrow key — with shift, ten at a time — in a number field.
 *
 * The report: "число начинает прыгать и меняться на произвольное". Two causes,
 * both about the round trip.
 *
 * A key held down repeats every few tens of a second. Each repeat used to commit,
 * so each was a document write, an undo step, and a fresh `props` push. The panel
 * rebuilds the inspector on a push, and the rebuilt field was built from the value
 * in that push — which by then was two or three presses behind what the user had
 * already stepped to. So the number bounced between the local value and the
 * arriving ones, and could not be brought to rest.
 *
 * So: a repeat is a *live* step, like a scrub, committed once when the key comes
 * up; and a field with the focus keeps its own text through a rebuild, because it
 * belongs to whoever is typing in it until they leave it.
 */
const { w, errors, sent, post, check, expect } = require("../harness/ui.js");
const D = w.document;

const field = (key) => D.querySelector('#insp-body [data-key="' + key + '"] input');
const updates = (k) => sent.filter((m) => m.type === "update" && m.key === k);
const commits = (k) => updates(k).filter((m) => m.commit === true);
const lives = (k) => updates(k).filter((m) => m.commit === false);

function arrow(input, dir, shift) {
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: dir, shiftKey: !!shift, bubbles: true, cancelable: true }));
}
function release(input, dir) {
  input.dispatchEvent(new w.KeyboardEvent("keyup", { key: dir, bubbles: true, cancelable: true }));
}

function props(x) {
  post({ type: "props", count: 1, inspected: 1, ids: ["2:1"], types: ["FRAME"], refs: {}, bbox: null,
    props: { id: "2:1", name: "Card", type: "FRAME", visible: true, locked: false,
      x: x, y: 40, width: 200, height: 120, rotation: 0, opacity: 1, blendMode: "NORMAL",
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
props(0);
check("render");

let x = field("x");
expect("the X field is there", !!x);
expect("showing what the document says", x.value === "0");

/* ---- a run of presses is one edit, not one per press ---- */
x.focus();
sent.length = 0;
for (let i = 0; i < 5; i++) arrow(x, "ArrowUp", true);      /* shift: ten at a time */
console.log("after 5 × shift+↑ the field reads", x.value,
  "| live:", lives("x").length, "committed:", commits("x").length);
expect("the field stepped by ten each time", x.value === "50");
expect("every press was sent, so the canvas keeps up", lives("x").length === 5);
expect("and none of them committed", commits("x").length === 0);

release(x, "ArrowUp");
console.log("on release ->", JSON.stringify(commits("x").map(m => m.value)));
expect("releasing commits once", commits("x").length === 1);
expect("at the value the run ended on", commits("x")[0].value === 50);

/* ---- the document answering mid-run must not move the number ---- */
/* This is the bug itself: a push arrives carrying a value two presses old. */
x.focus();
sent.length = 0;
arrow(x, "ArrowUp", true);
arrow(x, "ArrowUp", true);
const mid = x.value;
props(50);                                  /* the answer to the first press */
x = field("x");
console.log("mid-run the document answered 50; the field reads", x.value, "(was", mid + ")");
expect("the field kept what the user had stepped to", x.value === mid);
expect("and it still has the focus", D.activeElement === x);
arrow(x, "ArrowUp", true);
console.log("one more press ->", x.value);
expect("the next press carries on from there, it does not jump back", x.value === "80");
release(x, "ArrowUp");
expect("and the commit is the value on screen", commits("x").pop().value === 80);
check("stepping through a push");

/* ---- a single press, no shift ---- */
/* Leaving the field first: while it has the focus it keeps the user's own value,
   which is the point of the fix above — a push only reaches it once they are out. */
x.dispatchEvent(new w.Event("blur"));
x.blur();
props(0);
x = field("x");
console.log("out of focus, a push reaches the field again ->", x.value);
expect("once nobody is in it, the field follows the document again", x.value === "0");

x.focus();
sent.length = 0;
arrow(x, "ArrowDown");
release(x, "ArrowDown");
console.log("one ↓ ->", x.value, "| sent:", JSON.stringify(updates("x").map(m => m.value + ":" + m.commit)));
expect("one step of one", x.value === "-1");
expect("one live and one commit", lives("x").length === 1 && commits("x").length === 1);

/* ---- leaving the field afterwards must not send it again ---- */
sent.length = 0;
x.dispatchEvent(new w.Event("blur"));
console.log("blur after a release sent", updates("x").length, "more");
expect("the blur adds nothing, the value was already committed", updates("x").length === 0);

/* ---- typing still works, and is still one edit ---- */
x.blur();
props(0);
x = field("x");
x.value = "123";
x.dispatchEvent(new w.Event("input", { bubbles: true }));
sent.length = 0;
x.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
x.dispatchEvent(new w.Event("blur"));
console.log("typed 123 ->", JSON.stringify(updates("x").map(m => m.value + ":" + m.commit)));
expect("typing commits once", commits("x").length === 1 && commits("x")[0].value === 123);
expect("and does not also arrive as a live edit", lives("x").length === 0);
check("typing");

console.log("\nERRORS:", errors.length ? errors : "(none)");
