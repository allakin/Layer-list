/*
 * Applying a style from a section that has nothing in it yet.
 *
 * The report: "эффекты из библиотеки не применяются". Not the applying — that
 * works, and `tests/plugin/library-style-apply.js` covers it. There was no way to
 * *ask*: an untouched section collapses to a greyed title and a single "+", so a
 * layer with no effect offered no style picker at all. An effect style **is** the
 * effect, so needing one before you can pick one is a dead end. The same held for
 * Fill and Stroke, where it was easier to miss because adding a fill first and
 * applying a style over it feels natural.
 *
 * What each library entry sends is checked too: the id the index remembers *and*
 * the key, because that id is a local instance the file may already have dropped.
 */
const { w, errors, sent, post, check, expect } = require("../harness/ui.js");
const D = w.document;

const click = (el) => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
const closePop = () => D.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
const btn = (title) => D.querySelector('#insp-body .ib[title="' + title + '"]');
const sectionOf = (name) => [...D.querySelectorAll("#insp-body .sec")]
  .find((s) => s.querySelector(".sec-hd .t") && s.querySelector(".sec-hd .t").textContent === name);
const menuItems = () => [...D.querySelectorAll("#pop-layer .mi")];
const styleUpdate = (key) => sent.filter((m) => m.type === "update" && m.key === key).pop();

/* a layer with no fill, no stroke and no effect — everything untouched */
function bare() {
  post({ type: "props", count: 1, inspected: 1, ids: ["t"], types: ["FRAME"], refs: {}, bbox: null,
    props: { id: "t", name: "Card", type: "FRAME", visible: true, locked: false,
      x: 0, y: 0, width: 200, height: 40, rotation: 0, opacity: 1, blendMode: "NORMAL",
      constraints: { horizontal: "MIN", vertical: "MIN" }, inAutoLayout: false,
      layoutSizingHorizontal: null, layoutSizingVertical: null, layoutPositioning: null,
      layoutMode: "NONE", clipsContent: true, cornerRadius: 0,
      fills: [], fillStyleId: "", strokes: [], strokeStyleId: "", strokeWeight: 0,
      strokeAlign: "CENTER", dashPattern: "", strokeSides: { top: null },
      effects: [], effectStyleId: "", exportSettings: [], boundVariables: {}, childCount: 0 } });
}

post({ type: "pages", pages: [{ id: "0:1", name: "P" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: ["t"],
  rows: [{ id: "t", name: "Card", type: "FRAME", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false }] });
bare();
/* only library styles exist, which is the situation the report came from */
post({ type: "styles", paint: [], text: [], effect: [], grid: [],
  library: {
    paint: [{ id: "S:lp", key: "kp", name: "Colors/Bg/Accent", type: "PAINT", remote: true, color: "#0D99FF", desc: "" }],
    text: [], grid: [],
    effect: [{ id: "S:lf", key: "kf", name: "Elevation/2", type: "EFFECT", remote: true, color: null, desc: "2 effects" }],
    scannedAll: false, truncated: false } });
check("render");

/* ---- the reported dead end ---- */
const fx = sectionOf("Effects");
console.log("empty Effects section holds:",
  [...fx.querySelectorAll(".sec-hd .ib")].map(b => JSON.stringify(b.title)).join(", "));
expect("an untouched Effects section is still there", !!fx);
expect("and it offers the style picker, not only “+”", !!btn("Apply an effect style"));
expect("with the “+” kept alongside it", !!btn("Add effect"));

sent.length = 0;
click(btn("Apply an effect style"));
const offered = menuItems().map(m => m.textContent);
console.log("effect styles offered:", JSON.stringify(offered));
expect("the library's effect styles are listed", offered.some(t => /Elevation\/2/.test(t)));
click(menuItems().find(m => /Elevation\/2/.test(m.textContent)));
const applied = styleUpdate("style.effect");
console.log("applied ->", JSON.stringify(applied));
expect("picking one applies it", !!applied);
expect("by the id the index remembers", applied.value === "S:lf");
expect("and with the key, which outlives that id", applied.extra === "kf");
check("effect style from an empty section");

/* ---- the same for paints ---- */
bare();
expect("an untouched Fill section offers its picker too", !!btn("Apply a paint style or token"));
sent.length = 0;
click(btn("Apply a paint style or token"));
let rows = [...D.querySelectorAll("#pop-layer .tok-row")];
console.log("paint styles offered:", rows.map(r => r.querySelector(".nm").textContent).join(", "));
expect("the library's paint styles are listed", rows.length > 0);
click(rows[0]);
const paintApplied = styleUpdate("style.fill");
console.log("applied ->", JSON.stringify(paintApplied));
expect("picking one applies it", !!paintApplied && paintApplied.value === "S:lp");
expect("with its key", !!paintApplied && paintApplied.extra === "kp");
closePop();
check("paint style from an empty section");

/* ---- a local style has no key: the id is the real thing ---- */
post({ type: "styles",
  paint: [{ id: "S:localgrey", key: "klocal", name: "Local/Grey", type: "PAINT", remote: false, color: "#888888", desc: "" }],
  text: [], effect: [], grid: [],
  library: { paint: [], text: [], effect: [], grid: [], scannedAll: false, truncated: false } });
bare();
sent.length = 0;
click(btn("Apply a paint style or token"));
rows = [...D.querySelectorAll("#pop-layer .tok-row")];
click(rows[0]);
const localApplied = styleUpdate("style.fill");
console.log("local style ->", JSON.stringify(localApplied));
expect("a local style is applied by id", !!localApplied && localApplied.value === "S:localgrey");
expect("and carries no key to import by", !localApplied.extra);
closePop();
check("local style");

console.log("\nERRORS:", errors.length ? errors : "(none)");
