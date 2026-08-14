/*
 * A picker backed by a library is used by typing, not by scrolling — a file holds
 * hundreds of styles and tokens — so the search line has to hold the focus the
 * moment the picker opens.
 *
 * The trap this pins down is the colour picker. It is where paint styles live, so
 * it has to focus the search too, but its first <input> is the hex field: any
 * `querySelector("input")` shortcut lands on the wrong control. Every picker goes
 * through `.psearch` for exactly that reason, and the hex field has to stay the
 * first input, because that is how the field is reached elsewhere.
 */
const { w, errors, post, check, expect } = require("../harness/ui.js");
const D = w.document;
function click(el, label) {
  if (!el) { errors.push("missing element to click: " + label); return; }
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
}
const closePop = () => D.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
const focused = () => D.activeElement;
const pop = () => D.querySelector("#pop-layer .pop");

post({ type: "pages", pages: [{ id: "0:1", name: "Page 1" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: ["2:1"],
  rows: [{ id: "2:1", name: "Heading", type: "TEXT", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false }] });

post({ type: "props", count: 1, inspected: 1, ids: ["2:1"], types: ["TEXT"], refs: {},
  props: { id: "2:1", name: "Heading", type: "TEXT", visible: true, locked: false,
    x: 0, y: 0, width: 200, height: 40, rotation: 0, opacity: 1, blendMode: "NORMAL",
    constraints: { horizontal: "MIN", vertical: "MIN" }, inAutoLayout: false,
    layoutSizingHorizontal: null, layoutSizingVertical: null, layoutPositioning: null,
    fills: [{ type: "SOLID", visible: true, opacity: 1, blendMode: "NORMAL", color: "#111111", colorVar: null }],
    fillStyleId: "", strokes: [], strokeStyleId: "", strokeWeight: 0, strokeAlign: "CENTER",
    dashPattern: "", strokeSides: { top: null }, effects: [], effectStyleId: "",
    exportSettings: [], boundVariables: {}, childCount: 0, textStyleId: "",
    text: { fontFamily: "Inter", fontStyle: "Regular", fontSize: 24,
      lineHeight: { value: 32, unit: "PIXELS" }, letterSpacing: { value: 0, unit: "PERCENT" },
      paragraphSpacing: 0, paragraphIndent: 0, textAlignHorizontal: "LEFT", textAlignVertical: "TOP",
      textCase: "ORIGINAL", textDecoration: "NONE", textAutoResize: "HEIGHT",
      textTruncation: "DISABLED", maxLines: null, leadingTrim: "NONE", characters: 7 } } });

/* a library worth searching rather than scrolling */
post({ type: "styles",
  paint: [{ id: "S:1", name: "Surface/Card", color: "#F5F5F5" }, { id: "S:2", name: "Brand/Primary", color: "#0D99FF" }],
  text: [{ id: "S:3", name: "Body/Regular", desc: "Inter Regular · 14" }, { id: "S:4", name: "Heading/H1", desc: "Inter Bold · 32" }],
  effect: [], grid: [] });
post({ type: "variables", collections: [
  { id: "C:1", name: "Primitives", remote: false, defaultModeId: "M:1", modes: [{ id: "M:1", name: "Value" }],
    variables: [
      { id: "V:1", name: "color/bg/default", group: "color/bg", short: "default", type: "COLOR", description: "", scopes: [],
        byMode: { "M:1": { alias: false, aliasName: null, color: "#FFFFFF", alpha: 1, text: null } } },
      { id: "V:2", name: "space/md", group: "space", short: "md", type: "FLOAT", description: "", scopes: [],
        byMode: { "M:1": { alias: false, aliasName: null, color: null, alpha: 1, text: "16" } } }
    ] }] });
post({ type: "fonts", fonts: [
  { family: "Inter", styles: ["Regular", "Bold"] }, { family: "Roboto", styles: ["Regular"] }] });
check("render");

/* ---- the colour picker, where paint styles live ---- */
click(D.querySelector(".sec .prow .sw"), "fill swatch");
let cp = pop();
expect("the colour picker opened", !!cp);
const search = cp && cp.querySelector(".psearch");
expect("it carries a styles-and-tokens search", !!search);
console.log("focused:", focused() && focused().className, "| placeholder:", focused() && focused().placeholder);
expect("the search has the focus on open", focused() === search);
/* the trap: a querySelector("input") shortcut would have landed here instead */
const firstInput = cp && cp.querySelectorAll("input")[0];
expect("the hex field is still the first input", !!firstInput && firstInput !== search);
expect("and it is not what got the focus", focused() !== firstInput);

/* typing filters, and the focus stays put across the repaint */
search.value = "brand";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
const names = [...D.querySelectorAll("#pop-layer .tok-row .nm")].map(e => e.textContent);
console.log("filtered to:", JSON.stringify(names));
expect("typing narrows the list", names.length > 0 && names.every(n => /brand/i.test(n)));
check("colour picker");
closePop();

/* ---- the text style picker ---- */
click([...D.querySelectorAll(".sec-hd .acts .ib")].find(b => /text style/i.test(b.title)), "text style button");
expect("the text style picker opened", !!pop());
let ps = pop() && pop().querySelector(".psearch");
console.log("text styles:", [...D.querySelectorAll("#pop-layer .tok-row .nm, #pop-layer .mi .t")].map(e => e.textContent).join(", "));
expect("its search has the focus", !!ps && focused() === ps);
check("text style picker");
closePop();

/* ---- the font picker ---- */
click(D.querySelector(".sec .fld.ref"), "font family field");
ps = pop() && pop().querySelector(".psearch");
expect("the font picker's search has the focus", !!ps && focused() === ps);
check("font picker");
closePop();

/* ---- the token picker, reached from a field's token button ---- */
const tokBtn = [...D.querySelectorAll(".fld .tail .ib")].find(b => /Apply a variable/.test(b.title));
click(tokBtn, "token button");
ps = pop() && pop().querySelector(".psearch");
expect("the token picker's search has the focus", !!ps && focused() === ps);
check("token picker");
closePop();

console.log("\nERRORS:", errors.length ? errors : "(none)");
