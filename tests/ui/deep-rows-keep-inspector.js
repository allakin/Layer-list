/*
 * A layer row is as wide as its content — long names and deep nesting scroll
 * sideways instead of being clipped. That width must not reach the flex layout:
 * with `flex: 1 1 auto` the layers pane asked for its widest row (a self-nesting
 * branch made that thousands of pixels), and the inspector, which is allowed to
 * shrink, collapsed to nothing — the panel looked like it had lost its Design
 * half. The pane sizes from the space it is given, never from its content.
 *
 * The same tree also has to say where it stopped: a row that repeats an ancestor
 * carries a badge instead of a caret that would open nothing.
 */
const { w, errors, post, check, expect } = require("../harness/ui.js");
const D = w.document;
const css = (el, prop) => w.getComputedStyle(el)[prop];

const row = (id, name, depth, extra) => Object.assign({
  id, name, depth, parentId: "0:1", type: "FRAME",
  visible: true, locked: false, hasChildren: false, expanded: false, inComponent: false
}, extra);

post({ type: "pages", pages: [{ id: "0:1", name: "В работе" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "В работе", truncated: false, searching: false, selection: ["dialog"], zoom: 1, rows: [
  row("dialog", "Dialog", 0, { type: "INSTANCE", hasChildren: true, expanded: true }),
  row("content", "Content", 1, { type: "SLOT", hasChildren: true, expanded: true }),
  row("inner", "Frame 2131329723", 2, { hasChildren: true, expanded: true }),
  row("dialog", "Dialog", 3, { type: "INSTANCE", hasChildren: false, cycle: true }),
  row("long", "A layer name long enough to be wider than the whole plugin window on its own", 3)
]});
check("layers");

const pane = D.getElementById("layers-pane");
const insp = D.getElementById("inspector");
const anyRow = D.querySelector(".lrow");

console.log("row width rule      :", css(anyRow, "width"));
console.log("#layers-pane flex   :", css(pane, "flex"));
console.log("#inspector   flex   :", css(insp, "flex"));
console.log("deepest row padding :", css(D.querySelectorAll(".lrow")[3], "paddingLeft"));

expect("rows are still content-sized", css(anyRow, "width") === "max-content");
expect("the layers pane takes its size from the space, not the content",
  css(pane, "flexBasis") === "0px" && css(pane, "flexGrow") === "1");
expect("the inspector keeps a width of its own",
  parseFloat(css(insp, "flexBasis")) >= 200);
expect("and the layers pane still has a floor to shrink to",
  parseFloat(css(pane, "minWidth")) > 0);

const rows = [...D.querySelectorAll(".lrow")];
const loop = rows[3];
console.log("\nloop row            :", loop.querySelector(".nm").textContent,
  "| badge:", loop.querySelector(".badge") ? JSON.stringify(loop.querySelector(".badge").textContent) : "(none)",
  "| caret:", loop.querySelector(".caret").className);
console.log("first row           :", rows[0].querySelector(".nm").textContent,
  "| badge:", rows[0].querySelector(".badge") ? "yes" : "(none)",
  "| caret:", rows[0].querySelector(".caret").className);

expect("the repeating row is marked", !!loop.querySelector(".badge"));
expect("it says why on hover", /repeat/i.test(loop.querySelector(".badge").title));
expect("it offers no caret", loop.querySelector(".caret").classList.contains("none"));
expect("ordinary rows carry no badge", !rows[0].querySelector(".badge"));
expect("and keep their caret", !rows[0].querySelector(".caret").classList.contains("none"));

console.log("\nERRORS:", errors.length ? errors : "(none)");
