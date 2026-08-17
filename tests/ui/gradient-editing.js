/*
 * Editing a gradient in the colour picker: the ramp, its handles, and the row
 * per stop under it.
 *
 * The bug this file starts with: pressing a handle threw
 *
 *   InvalidStateError: Failed to execute 'setPointerCapture' on 'Element'
 *
 * because pressing a handle selects that stop, selecting a stop repaints the
 * ramp, and repainting the ramp replaces every handle in it — so the capture was
 * asked for by an element that had already left the document. The harness stubs
 * setPointerCapture to a no-op, which cannot fail, so the stub is replaced here
 * by one that throws the way a browser does. Nothing about that is specific to
 * gradients: any capture taken after a repaint of the thing captured is dead.
 *
 * The ramp is therefore built once and only repainted, and the capture belongs
 * to the ramp, not to a handle. Its listeners went the same way: they used to be
 * attached inside the painter, so every repaint added one more, and a
 * double-click that had survived four repaints added five stops.
 */
const { w, errors, sent, post, check, expect } = require("../harness/ui.js");
const D = w.document;

/* A browser refuses a capture for an element that is not in the document. */
const captured = [];
w.Element.prototype.setPointerCapture = function (id) {
  if (!this.isConnected) {
    throw new w.DOMException("Failed to execute 'setPointerCapture' on 'Element'", "InvalidStateError");
  }
  captured.push(this);
};

function click(el, label) {
  if (!el) { errors.push("missing element to click: " + label); return; }
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
}
/* jsdom has no layout, so the ramp is given a box of its own to measure against. */
const RAMP = { left: 0, right: 200, top: 0, bottom: 24, width: 200, height: 24 };
/* jsdom has no PointerEvent, and the panel only reads clientX and pointerId. */
function pointerAt(el, frac, type) {
  const ev = new w.MouseEvent(type || "pointerdown", {
    bubbles: true, cancelable: true, clientX: RAMP.left + frac * RAMP.width, clientY: 12
  });
  ev.pointerId = 1;
  el.dispatchEvent(ev);
}
/* The colour of a handle lives on its inner <i>, over the chequers. */
const swatchOf = (g) => g.querySelector("i").style.background;
const closePop = () => D.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
const pop = () => D.querySelector("#pop-layer .pop");
const updates = (key) => sent.filter((m) => m.type === "update" && (!key || m.key === key));
function lastUpdate(key) { const l = updates(key); return l[l.length - 1]; }

function openGradientFill() {
  click(D.querySelectorAll(".sec .prow .sw")[0], "gradient fill swatch");
  const p = pop();
  const strip = p && p.querySelector(".gstrip");
  if (strip) strip.getBoundingClientRect = () => RAMP;
  return p;
}

post({ type: "pages", pages: [{ id: "0:1", name: "Page 1" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: ["2:1"],
  rows: [{ id: "2:1", name: "Hero", type: "FRAME", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false }] });
post({ type: "props", count: 1, inspected: 1, ids: ["2:1"], types: ["FRAME"], refs: {},
  props: { id: "2:1", name: "Hero", type: "FRAME", visible: true, locked: false,
    x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1, blendMode: "NORMAL",
    constraints: { horizontal: "MIN", vertical: "MIN" }, inAutoLayout: false,
    layoutSizingHorizontal: null, layoutSizingVertical: null, layoutPositioning: null,
    layoutMode: "NONE", clipsContent: true, cornerRadius: 0,
    /* black to grey, the gradient from the bug report, and turned a quarter so
       the ramp cannot pass by reading the paint's own angle */
    fills: [{ type: "GRADIENT_LINEAR", visible: true, opacity: 1, blendMode: "NORMAL",
      stops: [{ color: "#000000", a: 1, pos: 0 }, { color: "#666666", a: 1, pos: 1 }],
      transform: [[0, 1, 0], [-1, 0, 1]], stopVars: [null, null], colorVar: null }],
    fillStyleId: "", strokes: [], strokeStyleId: "", strokeWeight: 0, strokeAlign: "CENTER",
    dashPattern: "", strokeSides: { top: null }, effects: [], effectStyleId: "",
    exportSettings: [], boundVariables: {}, childCount: 0 } });
post({ type: "styles", paint: [], text: [], effect: [], grid: [] });
post({ type: "variables", collections: [] });
check("render");

/* ---- the crash ---- */
let cp = openGradientFill();
expect("the picker opened on a gradient", !!cp && !!cp.querySelector(".gstrip"));
let strip = cp.querySelector(".gstrip");
let handles = () => [...strip.querySelectorAll(".gs")];
console.log("handles:", handles().map(g => g.style.left).join(" "));
expect("one handle per stop", handles().length === 2);
expect("the first sits at the start of the ramp", handles()[0].style.left === "0%");
expect("the second at the end", handles()[1].style.left === "100%");

captured.length = 0;
pointerAt(handles()[1], 1);
console.log("errors after pressing a handle:", errors.length ? errors : "(none)");
expect("pressing a handle no longer throws", errors.length === 0);
expect("the capture was taken, and by an element still in the document",
  captured.length === 1 && captured[0].isConnected);
expect("it was taken by the ramp, which no repaint replaces", captured[0] === strip);
expect("pressing a handle selects its stop",
  handles()[1].classList.contains("on") && !handles()[0].classList.contains("on"));

/* dragging that handle to the middle: live while moving, committed on release */
pointerAt(strip, 0.5, "pointermove");
let live = lastUpdate("fill.gradientStop");
console.log("live move:", JSON.stringify(live));
expect("the move is sent as it happens", !!live && live.commit === false);
expect("with the position the pointer is at", !!live && Math.abs(live.value.pos - 0.5) < 1e-9);
expect("and the index of the stop being dragged", !!live && live.extra === 1);
pointerAt(strip, 0.5, "pointerup");
expect("releasing commits it", lastUpdate("fill.gradientStop").commit === true);
expect("the handle followed the pointer", handles()[1].style.left === "50%");
check("drag a stop");

/* Dragging past a neighbour: the two change places. The panel follows the stop
   rather than the slot it was in, and the index it sends with the next edit is
   the stop's new one — which is what keeps it pointing at the same stop as the
   document, where the same sort has just happened. */
let rows = () => [...pop().querySelectorAll(".gsrow")];
pointerAt(handles()[0], 0);                    /* the black stop, at 0% */
pointerAt(strip, 0.8, "pointermove");
pointerAt(strip, 0.8, "pointerup");
console.log("after dragging the black stop past the grey one:",
  handles().map(g => g.style.left + "=" + swatchOf(g)).join("  "));
expect("the ramp is in position order again", handles()[0].style.left === "50%");
expect("the two stops changed places", swatchOf(handles()[1]) === "rgb(0, 0, 0)");
expect("the dragged stop is still the selected one", handles()[1].classList.contains("on"));
expect("so is its row", rows()[1].classList.contains("on") && !rows()[0].classList.contains("on"));
expect("and the edit that committed it named the stop's new index",
  lastUpdate("fill.gradientStop").extra === 1);
check("reorder");
closePop();

/* ---- clicking bare ramp adds a stop, exactly one ---- */
cp = openGradientFill();
strip = cp.querySelector(".gstrip");
handles = () => [...strip.querySelectorAll(".gs")];
sent.length = 0;
pointerAt(strip, 0.5);
pointerAt(strip, 0.5, "pointerup");
let adds = updates("fill.gradientStopAdd");
console.log("adds sent by one click:", adds.length, JSON.stringify(adds[0]));
expect("clicking the ramp adds a stop", adds.length === 1);
expect("at the point that was clicked", Math.abs(adds[0].value.pos - 0.5) < 1e-9);
expect("in the right place in the array", adds[0].extra === 1);
/* black to grey, halfway: the colour the ramp already showed there, so adding a
   stop cannot change what the gradient looks like */
console.log("interpolated colour:", adds[0].value.color);
expect("taking the colour the ramp already had at that point", adds[0].value.color === "#333333");
expect("the panel drew the new handle", handles().length === 3);
expect("and a row for it", rows().length === 3);

/* the accumulating-listener regression: repaint the ramp a few times, then click
   again — one click, one stop */
sent.length = 0;
pointerAt(handles()[0], 0);
pointerAt(strip, 0.1, "pointermove");
pointerAt(strip, 0.1, "pointerup");
sent.length = 0;
pointerAt(strip, 0.75);
pointerAt(strip, 0.75, "pointerup");
console.log("adds after several repaints:", updates("fill.gradientStopAdd").length);
expect("a repainted ramp does not add a stop per repaint",
  updates("fill.gradientStopAdd").length === 1);
check("add a stop");

/* ---- the row per stop ---- */
console.log("rows:", rows().map(r => [...r.querySelectorAll("input")].map(i => i.value).join("/")).join("  |  "));
expect("the list has one row per stop", rows().length === 4);
let row = rows()[0];
let cells = [...row.querySelectorAll("input")];
expect("a row is position, colour, opacity", cells.length === 3);
expect("the position reads as a percentage", cells[0].value === "10");
expect("the colour as a hex without its hash", /^[0-9A-F]{6}$/.test(cells[1].value));
expect("the opacity as a percentage", cells[2].value === "100");
expect("and the row carries the stop's colour as a swatch", !!row.querySelector(".sw"));

sent.length = 0;
cells[1].value = "FF8800";
cells[1].dispatchEvent(new w.Event("blur"));
let col = lastUpdate("fill.gradientStop");
console.log("typing a hex into a row:", JSON.stringify(col));
expect("typing a hex into a row edits that stop", !!col && col.value.color === "#FF8800");
expect("and says which stop", !!col && col.extra === 0);

cells = [...rows()[0].querySelectorAll("input")];
cells[2].value = "40";
cells[2].dispatchEvent(new w.Event("blur"));
expect("typing an opacity edits the same stop's alpha",
  Math.abs(lastUpdate("fill.gradientStop").value.a - 0.4) < 1e-9);

cells = [...rows()[3].querySelectorAll("input")];
cells[0].value = "20";
cells[0].dispatchEvent(new w.Event("blur"));
console.log("last row moved to 20%:", rows().map(r => r.querySelectorAll("input")[0].value).join(" "));
expect("typing a position moves the stop", lastUpdate("fill.gradientStop").value.pos === 0.2);
expect("and the rows are in ramp order again",
  rows().map(r => +r.querySelectorAll("input")[0].value).every((v, i, a) => i === 0 || a[i - 1] <= v));
check("stop rows");

/* ---- adding and removing from the list ---- */
sent.length = 0;
const plus = pop().querySelector(".cp-sec .h .ib");
click(plus, "add stop");
console.log("+ sent:", JSON.stringify(lastUpdate("fill.gradientStopAdd")));
expect("the + button adds a stop", updates("fill.gradientStopAdd").length === 1);
expect("in the widest gap left on the ramp",
  lastUpdate("fill.gradientStopAdd").value.pos > 0.2);

const minus = (i) => rows()[i].querySelector(".ib");
sent.length = 0;
click(minus(0), "remove stop 0");
console.log("removals:", JSON.stringify(updates("fill.gradientStopRemove")));
expect("a row's minus removes that stop", updates("fill.gradientStopRemove").length === 1);
expect("naming it by index", lastUpdate("fill.gradientStopRemove").extra === 0);
expect("and the row went with it", rows().length === 4);

while (rows().length > 2) click(minus(0), "remove down to two");
console.log("at two stops, minus is:", minus(0).disabled ? "disabled" : "still live");
expect("a gradient cannot be cut below two stops", rows().length === 2 && minus(0).disabled);
sent.length = 0;
strip.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
expect("nor by the keyboard", updates("fill.gradientStopRemove").length === 0 && rows().length === 2);
check("add and remove");

/* ⌫ with a stop to spare does remove it — and does not close the picker, which
   is what it used to do */
pointerAt(strip, 0.5);
pointerAt(strip, 0.5, "pointerup");
sent.length = 0;
strip.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
console.log("backspace removed:", JSON.stringify(lastUpdate("fill.gradientStopRemove")));
expect("⌫ removes the selected stop", updates("fill.gradientStopRemove").length === 1);
expect("and leaves the picker open", !!pop() && rows().length === 2);

/* ---- the two ramp-wide actions ---- */
sent.length = 0;
const hdBtns = [...pop().querySelectorAll(".pop-hd .ib")];
console.log("header buttons:", hdBtns.map(b => b.title).join(" | "));
expect("the header offers reverse and rotate beside the type",
  hdBtns.length === 3 && /Reverse/.test(hdBtns[0].title) && /Rotate/.test(hdBtns[1].title));
const before = handles().map(swatchOf);
click(hdBtns[0], "reverse");
console.log("reversed:", handles().map(swatchOf).join("  ") + "  was  " + before.join("  "));
expect("reverse is sent to the document", updates("fill.gradientReverse").length === 1);
expect("and the ramp shows it at once",
  handles().map(swatchOf).join() === before.slice().reverse().join());
click(hdBtns[1], "rotate");
expect("rotate is sent to the document", updates("fill.gradientRotate").length === 1);
check("reverse and rotate");

/* ---- the ramp is an editor of positions, not a preview of the paint ----
   The paint is a quarter turn and could be radial; the ramp is neither. */
console.log("ramp background:", strip.style.background);
expect("the ramp runs left to right whatever angle the gradient has",
  /^linear-gradient\(90deg/.test(strip.style.background));
const ramped = (strip.style.background.match(/(\d+)%/g) || []).join(" ");
const listed = rows().map(r => r.querySelectorAll("input")[0].value + "%").join(" ");
console.log("ramp stops at", ramped, "· rows say", listed);
expect("every stop sits on the ramp where the list says it does", ramped === listed);

/* the picker still opens on the search, and the hex field is still its first
   input: the stop rows are inputs too, and they come after both */
closePop();
cp = openGradientFill();
const inputs = [...cp.querySelectorAll("input")];
expect("the search still has the focus on open", D.activeElement === cp.querySelector(".psearch"));
expect("the hex field is still the picker's first input",
  inputs[0] === cp.querySelector(".cp-fields input"));
expect("the stop rows come after it", cp.querySelectorAll(".gsrow input").length === 6);
check("picker conventions");
closePop();

console.log("\nERRORS:", errors.length ? errors : "(none)");
