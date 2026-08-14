/*
 * The colour picker is two things at once: a palette to mix a colour by hand, and
 * a list of the colours the file already has. Side by side they stop competing
 * for the same vertical run, so neither is scrolled to reach the other.
 *
 * Three things hold that layout together:
 *   - the palette comes first in the DOM, because the hex field has to stay the
 *     picker's first <input> (see picker-search-focus.js);
 *   - the focus still lands on the library search, not on the hex field;
 *   - 420px of window is needed for both columns and the panel goes down to
 *     260px, so below that they stack and the popover narrows to match — a
 *     420px popover in a 260px window is simply cut off.
 */
const { w, errors, post, check, expect } = require("../harness/ui.js");
const D = w.document;
function click(el, label) {
  if (!el) { errors.push("missing element to click: " + label); return; }
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
}
const closePop = () => D.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
const pop = () => D.querySelector("#pop-layer .pop");
const openFill = () => click(D.querySelector(".sec .prow .sw"), "fill swatch");

post({ type: "pages", pages: [{ id: "0:1", name: "Page 1" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: ["2:1"],
  rows: [{ id: "2:1", name: "Card", type: "FRAME", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false }] });
post({ type: "props", count: 1, inspected: 1, ids: ["2:1"], types: ["FRAME"], refs: {},
  props: { id: "2:1", name: "Card", type: "FRAME", visible: true, locked: false,
    x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1, blendMode: "NORMAL",
    constraints: { horizontal: "MIN", vertical: "MIN" }, inAutoLayout: false,
    layoutSizingHorizontal: null, layoutSizingVertical: null, layoutPositioning: null,
    layoutMode: "NONE", clipsContent: true, cornerRadius: 0,
    fills: [{ type: "SOLID", visible: true, opacity: 1, blendMode: "NORMAL", color: "#111111", colorVar: null }],
    fillStyleId: "", strokes: [], strokeStyleId: "", strokeWeight: 0, strokeAlign: "CENTER",
    dashPattern: "", strokeSides: { top: null }, effects: [], effectStyleId: "",
    exportSettings: [], boundVariables: {}, childCount: 0 } });
post({ type: "styles",
  paint: [{ id: "S:1", name: "Surface/Card", color: "#F5F5F5" }, { id: "S:2", name: "Brand/Primary", color: "#0D99FF" },
    { id: "S:3", name: "Accent", color: "#FF3B30" }],
  text: [], effect: [], grid: [] });
post({ type: "variables", collections: [
  { id: "C:1", name: "Primitives", remote: false, defaultModeId: "M:1", modes: [{ id: "M:1", name: "Value" }],
    variables: [
      { id: "V:1", name: "color/bg/default", group: "color/bg", short: "default", type: "COLOR", description: "", scopes: [],
        byMode: { "M:1": { alias: false, aliasName: null, color: "#FFFFFF", alpha: 1, text: null } } }
    ] }] });
check("render");

/* ---- wide enough for both columns ---- */
w.innerWidth = 900;
openFill();
let cp = pop();
expect("the colour picker opened", !!cp);
const cols = cp && cp.querySelector(".cp-cols");
console.log("columns:", cols && cols.className, "| popover width:", cp && cp.style.width);
expect("the two columns are side by side", !!cols && cols.classList.contains("two"));
expect("and the popover widened to hold them", cp.style.width === "420px");

const left = cp && cp.querySelector(".cp-left");
const right = cp && cp.querySelector(".cp-right");
expect("the palette is a column of its own", !!left);
expect("the library is a column of its own", !!right);
console.log("palette holds:", left && [...left.children].map(e => e.className).join(", "));
console.log("library holds:", right && [...right.children].map(e => e.className || e.tagName).join(", "));

expect("the SV square is in the palette", !!left && !!left.querySelector(".sv"));
expect("both sliders are in the palette", !!left && left.querySelectorAll(".slid").length === 2);
expect("the hex and opacity fields are in the palette", !!left && left.querySelectorAll(".cp-fields input").length === 2);
expect("no palette control leaked into the library column",
  !!right && !right.querySelector(".sv, .slid, .cp-fields"));

const search = right && right.querySelector(".psearch");
expect("the style search is in the library column", !!search);
expect("so is the list it filters", !!right && !!right.querySelector(".tok-list"));
expect("the library column has no search of the palette's own", !!left && !left.querySelector(".psearch"));

/* the constraint the column order exists for */
const inputs = [...cp.querySelectorAll("input")];
expect("the hex field is still the picker's first input",
  inputs.length > 1 && inputs[0] !== search && left.contains(inputs[0]));
/* and the focus still goes to the search, not to that first input */
console.log("focused:", D.activeElement && D.activeElement.className);
expect("the search has the focus on open", D.activeElement === search);

/* the list is still the file's colours, and still filters */
search.value = "brand";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
let names = [...right.querySelectorAll(".tok-row .nm")].map(e => e.textContent);
console.log("filtered to:", JSON.stringify(names));
expect("typing narrows the library list", names.length > 0 && names.every(n => /brand/i.test(n)));

/* A name is a path, and what tells two of them apart is the tail. The column is
   184px, so ellipsising from the right would turn `color/text/primary` and
   `color/text/primary-hover` into the same row — which reads as a duplicate.
   The group prefix is what gives way; the leaf always stays. */
search.value = "";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
const tokRow = [...right.querySelectorAll(".tok-row")].find(r => /color\/bg\/default/.test(r.textContent));
const nm = tokRow && tokRow.querySelector(".nm");
console.log("name parts:", nm && [...nm.children].map(e => e.className + "=" + e.textContent).join(" + "));
expect("a path name is split into prefix and leaf", !!nm && nm.classList.contains("path"));
expect("the leaf is what the name ends in", !!nm && nm.querySelector(".leaf").textContent === "default");
expect("the prefix is the group it sits in", !!nm && nm.querySelector(".pre").textContent === "color/bg/");
expect("and the name still reads whole", !!nm && nm.textContent === "color/bg/default");
/* the hex column went with it: the swatch is the value, and those 45px are the
   difference between reading a name and guessing at it */
expect("no hex column competes for the width", !right.querySelector(".tok-row .val"));
/* a name with no group stays one plain span */
const flat = [...right.querySelectorAll(".tok-row")].find(r => r.textContent === "Accent");
expect("a name without a group is left alone",
  !!flat && !flat.querySelector(".nm").classList.contains("path"));

/* Recent is empty at this point, and must take no space rather than an empty band */
const rec = left.querySelector(".cp-sec");
expect("Recent sits in the palette column", !!rec);
expect("and is display:none while there is nothing in it", !!rec && rec.style.display === "none");
check("two columns");

/* committing a colour fills Recent — in the palette, not in the library */
const hexIn = inputs[0];
hexIn.value = "FF8800";
hexIn.dispatchEvent(new w.Event("blur"));
closePop();
openFill();
cp = pop();
const rec2 = cp.querySelector(".cp-left .cp-sec");
const sws = rec2 ? [...rec2.querySelectorAll(".swatches .sw")].map(e => e.title) : [];
console.log("recent swatches:", JSON.stringify(sws));
expect("a committed colour shows up under Recent", sws.indexOf("#FF8800") > -1);
expect("Recent takes space again once it has something", rec2 && rec2.style.display !== "none");
expect("Recent is not in the library column", !cp.querySelector(".cp-right .swatches"));
expect("the search still has the focus", D.activeElement === cp.querySelector(".psearch"));
check("recent colours");
closePop();

/* ---- too narrow for two columns: they stack, as they did before ---- */
w.innerWidth = 300;
openFill();
cp = pop();
const stacked = cp && cp.querySelector(".cp-cols");
console.log("narrow columns:", stacked && stacked.className, "| popover width:", cp && cp.style.width);
expect("a narrow window stacks the columns", !!stacked && !stacked.classList.contains("two"));
expect("and the popover narrows with them", cp.style.width === "240px");
expect("the palette is still there", !!cp.querySelector(".cp-left .sv"));
expect("so is the library search", !!cp.querySelector(".cp-right .psearch"));
expect("which still has the focus", D.activeElement === cp.querySelector(".psearch"));
check("stacked");
closePop();
w.innerWidth = 900;

console.log("\nERRORS:", errors.length ? errors : "(none)");
