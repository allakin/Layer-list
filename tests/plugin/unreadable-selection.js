/*
 * "I selected a layer and the panel is empty."
 *
 * Hardening readProps against dead nodes made its failures silent, so any node
 * that tripped a property read rendered as "Nothing selected" with no clue why.
 * A failure must reach the copyable error bar, and one bad node in a selection
 * must not take the readable ones with it.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

const good = {
  id: "good", name: "Ordinary rectangle", type: "RECTANGLE",
  visible: true, locked: false, removed: false,
  x: 0, y: 0, width: 100, height: 40, rotation: 0,
  opacity: 1, blendMode: "NORMAL",
  fills: [], strokes: [], effects: [], exportSettings: [],
  constraints: { horizontal: "MIN", vertical: "MIN" },
  boundVariables: {}, children: []
};

/* a node whose name is readable but whose geometry throws — the shape of a
   property read going wrong on an unexpected node type */
const bad = new Proxy({}, {
  get(_, prop) {
    if (prop === "id") return "bad";
    if (prop === "name") return "Unreadable layer";
    if (prop === "type") return "RECTANGLE";
    if (prop === "removed") return false;
    if (prop === "visible") return true;
    if (prop === "locked") return false;
    throw new Error("property " + String(prop) + " is not available on this node");
  },
  has(_, prop) {
    if (prop === "x" || prop === "width") return true;   // lures readProps in
    return false;
  }
});

const page = P.mkNode({ id: "page", name: "Page 1", type: "PAGE", children: [good] });
page.selection = [];
page.on = () => {}; page.off = () => {};
page.loadAsync = async () => {}; page.findAll = () => []; page.findAllWithCriteria = () => [];
f.root.children = [page]; f.currentPage = page; f.root.id = "doc-unreadable";
f.getLocalPaintStylesAsync = async () => [];
f.variables.getLocalVariableCollectionsAsync = async () => [];

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* selectionchange is coalesced on a 90 ms timer, so every check has to outwait it */
const SETTLE = 180;
const last = (type) => P.posted.filter((m) => m.type === type).pop();

(async () => {
  /* 1. a readable layer fills the panel */
  page.selection = [good];
  P.posted.length = 0;
  P.events.selectionchange();
  await wait(SETTLE);
  let props = last("props");
  console.log("readable layer → props:", props && props.props ? props.props.type : "(none)");
  P.expect("a readable layer produces a panel", !!(props && props.props));

  /* 2. an unreadable one reports why instead of going quiet */
  page.selection = [bad];
  P.posted.length = 0;
  P.events.selectionchange();
  await wait(SETTLE);
  props = last("props");
  const err = last("error");
  console.log("\nunreadable layer → props:", props ? String(props.props) : "(none)");
  console.log("  error sent to the panel:", err ? JSON.stringify(err.message) : "(none)");
  P.expect("the panel is told there is nothing to show", !!props && props.props === null);
  P.expect("the reason reaches the copyable error bar", !!err);
  P.expect("the message names the layer", !!err && /Unreadable layer/.test(err.message));
  P.expect("the message names the cause", !!err && /not available on this node/.test(err.message));
  P.posted.length = 0;                       // the notify that went with it is expected

  /* 3. one bad node must not sink the readable ones */
  page.selection = [good, bad];
  P.posted.length = 0;
  P.events.selectionchange();
  await wait(SETTLE);
  props = last("props");
  console.log("\nmixed selection → props:", props && props.props ? props.props.type : "(none)",
    "| inspected:", props && props.inspected);
  P.expect("the readable layer still renders", !!(props && props.props));
  P.expect("only the readable one was inspected", props.inspected === 1);
  P.posted.length = 0;

  P.finish();
})().catch((e) => {
  console.error("FAIL:", e.stack.split("\n").slice(0, 3).join(" | "));
  process.exit(1);
});
