/*
 * One layer, one highlight. A recursive instance turns up inside its own subtree
 * and every one of those repeats carries the *same node id*, so painting the
 * selection by id lit up eight rows for one selected layer — the panel said
 * "eight Drawers are selected" while the badge said one and every edit went to
 * one. Only the first occurrence, which is where the layer actually lives and
 * what every id lookup in the tree resolves to, takes the paint.
 *
 * The repeats keep the cues that are true of them: the ↻ badge, and the subtree
 * wash when they sit inside the selection.
 */
const { w, errors, post, check, expect, sent } = require("../harness/ui.js");
const D = w.document;

const row = (id, name, depth, extra) => Object.assign({
  id, name, depth, parentId: "0:1", type: "INSTANCE",
  visible: true, locked: false, hasChildren: false, expanded: false, inComponent: false
}, extra);

/* Drawer holds a List-item and, twice over, itself. */
const ROWS = [
  row("frame", "Frame 2087329484", 0, { type: "FRAME", hasChildren: true, expanded: true }),
  row("I1;drawer", "Drawer", 1, { hasChildren: true, expanded: true }),
  row("I1;drawer", "Drawer", 2, { cycle: true }),
  row("I1;list", "List-item", 2, { hasChildren: true, expanded: true }),
  row("I1;text", "Text", 3, { type: "TEXT" }),
  row("I1;drawer", "Drawer", 2, { cycle: true })
];

post({ type: "pages", pages: [{ id: "0:1", name: "P" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "P", truncated: false, searching: false,
  selection: ["I1;drawer"], zoom: 1, rows: ROWS });
check("layers");

const rows = () => [...D.querySelectorAll(".lrow")];
const painted = () => rows().filter((el) => el.classList.contains("sel"));
const label = (el) => el.querySelector(".nm").textContent + "@" + el.style.paddingLeft;

console.log("rows            :", rows().length);
console.log("painted selected:", painted().map(label).join(", ") || "(none)");
console.log("repeat rows     :", rows().filter((el) => el.querySelector(".badge")).map(label).join(", "));

expect("one selected layer paints one row", painted().length === 1);
expect("and it is the one the layer lives at", painted()[0] === rows()[1]);
expect("the repeats are not painted as selected",
  !rows()[2].classList.contains("sel") && !rows()[5].classList.contains("sel"));
expect("they still say they repeat", !!rows()[2].querySelector(".badge"));
expect("and still read as inside the selection", rows()[2].classList.contains("sub"));

/* Clicking a repeat asks for nothing new — it is the same node, already
   selected — but it must not be mistaken for a second layer either. */
sent.length = 0;
const down = new w.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX: 8, clientY: 8 });
down.pointerId = 1;
rows()[5].dispatchEvent(down);
console.log("\nclick on a repeat sent:", sent.length ? JSON.stringify(sent) : "(nothing)");
expect("clicking a repeat does not re-select or add to the selection",
  !sent.some((m) => m.type === "select"));
expect("and still only one row is painted", painted().length === 1);

/* Two genuinely different layers still get two highlights. */
post({ type: "layers", pageName: "P", truncated: false, searching: false,
  selection: ["I1;drawer", "I1;list"], zoom: 1, rows: ROWS });
console.log("\ntwo layers selected ->", painted().map(label).join(", "));
expect("a real multi-selection paints one row each", painted().length === 2);
expect("the Drawer repeats stay out of it",
  !rows()[2].classList.contains("sel") && !rows()[5].classList.contains("sel"));

console.log("\nERRORS:", errors.length ? errors : "(none)");
