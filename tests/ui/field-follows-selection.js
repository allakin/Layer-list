/*
 * A field belongs to the layer that is selected *now*.
 *
 * The report: type an angle into Rotation, then click a different layer — and that
 * layer turned by the number meant for the first one, while the field went on
 * showing the old value.
 *
 * Two things had to be true at once for that. Clicking the canvas takes the focus
 * out of the iframe, so the input's `blur` — and the commit riding on it — arrives
 * *after* the selection has already changed. And the panel had just been taught to
 * carry a half-typed value through a rebuild (so that holding an arrow key was not
 * fought by the answering push), which kept that stale text alive to be committed.
 *
 * So: a rebuild for a *different* layer drops what was being typed, and an input
 * that has been replaced does not commit at all — whatever the field, not only
 * Rotation.
 */
const { w, errors, sent, post, check, expect } = require("../harness/ui.js");
const D = w.document;

const field = (key) => D.querySelector('#insp-body [data-key="' + key + '"] input');
const updates = (k) => sent.filter((m) => m.type === "update" && (!k || m.key === k));

function props(id, over) {
  post({ type: "props", count: 1, inspected: 1, ids: [id], types: ["FRAME"], refs: {}, bbox: null,
    props: Object.assign({
      id: id, name: "Layer " + id, type: "FRAME", visible: true, locked: false,
      x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1, blendMode: "NORMAL",
      constraints: { horizontal: "MIN", vertical: "MIN" }, inAutoLayout: false,
      layoutSizingHorizontal: null, layoutSizingVertical: null, layoutPositioning: null,
      layoutMode: "NONE", clipsContent: true, cornerRadius: 0,
      fills: [], fillStyleId: "", strokes: [], strokeStyleId: "", strokeWeight: 0,
      strokeAlign: "CENTER", dashPattern: "", strokeSides: { top: null }, effects: [],
      effectStyleId: "", exportSettings: [], boundVariables: {}, childCount: 0
    }, over || {}) });
}

post({ type: "pages", pages: [{ id: "0:1", name: "Page 1" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: ["a"],
  rows: [{ id: "a", name: "Layer a", type: "FRAME", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false },
   { id: "b", name: "Layer b", type: "FRAME", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false }] });
props("a", { rotation: 0 });
check("render");

/* ---- the reported case ---- */
let rot = field("rotation");
expect("the Rotation field is there", !!rot);
rot.focus();
rot.value = "130";
rot.dispatchEvent(new w.Event("input", { bubbles: true }));

/* another layer is picked on the canvas: the push comes first, the blur after */
const old = rot;                      /* the input the user was typing in */
sent.length = 0;
props("b", { rotation: 45 });
rot = field("rotation");
console.log("after picking another layer, the field reads", JSON.stringify(rot.value));
expect("the field shows the new layer's angle", rot.value === "45");
expect("not the number typed for the old one", rot.value !== "130");
expect("and it is not holding the focus hostage", D.activeElement !== rot);

/* the blur of the input that was replaced, arriving late */
expect("the input that was typed in is no longer in the document", !old.isConnected);
sent.length = 0;
old.dispatchEvent(new w.Event("blur"));
console.log("late blur on the replaced input sent:", JSON.stringify(updates()));
expect("nothing was written to the newly selected layer", updates().length === 0);

/* and merely visiting a field writes nothing either */
sent.length = 0;
rot.focus();
rot.dispatchEvent(new w.Event("blur"));
console.log("focus in and out of an untouched field sent:", JSON.stringify(updates()));
expect("a field nobody edited is not committed on the way out", updates().length === 0);

/* escape puts the old value back without writing it */
sent.length = 0;
rot.focus();
rot.value = "77";
rot.dispatchEvent(new w.Event("input", { bubbles: true }));
rot.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
rot.dispatchEvent(new w.Event("blur"));
console.log("escape ->", JSON.stringify(rot.value), "| sent:", JSON.stringify(updates()));
expect("escape restores the value on screen", rot.value === "45");
expect("and writes nothing at all", updates().length === 0);

/* ---- the same layer changing is not the same thing ---- */
/* Here the half-typed value has to survive, or holding an arrow key fights the
   answering push — which is the bug the carrying-over was added for. */
rot = field("rotation");
rot.focus();
rot.value = "90";
rot.dispatchEvent(new w.Event("input", { bubbles: true }));
props("b", { rotation: 45 });
rot = field("rotation");
console.log("the same layer answered mid-edit; the field reads", JSON.stringify(rot.value));
expect("what was being typed is still there", rot.value === "90");
expect("and still has the focus", D.activeElement === rot);
sent.length = 0;
rot.dispatchEvent(new w.Event("blur"));
console.log("leaving it now sends:", JSON.stringify(updates("rotation").map(m => m.value)));
expect("leaving the field commits it, to the layer it was typed for",
  updates("rotation").length === 1 && updates("rotation")[0].value === 90);
check("rotation");

/* ---- every field, not only that one ---- */
[["x", 12], ["y", 34], ["w", 300]].forEach(function (pair) {
  props("a", { rotation: 0, x: 0, y: 0, width: 200 });
  const f = field(pair[0]);
  if (!f) { console.log("(no field for " + pair[0] + ")"); return; }
  f.focus();
  f.value = String(pair[1]);
  f.dispatchEvent(new w.Event("input", { bubbles: true }));
  sent.length = 0;
  props("b", { rotation: 0, x: 7, y: 8, width: 99 });      /* a different layer */
  const after = field(pair[0]);
  after.value;                                              /* read it back */
  f.dispatchEvent(new w.Event("blur"));                     /* the late blur */
  console.log("  " + pair[0] + ": field now", JSON.stringify(after.value),
    "| sent", updates().length);
  expect(pair[0] + " shows the new layer's own value", after.value !== String(pair[1]));
  expect("and " + pair[0] + " wrote nothing to it", updates().length === 0);
});
check("other fields");

console.log("\nERRORS:", errors.length ? errors : "(none)");
