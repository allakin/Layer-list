/*
 * The Prototype tab asks for interactions on whatever is selected, and not every
 * node type has them: on some, getReactionsAsync is simply absent. Asking must
 * come back empty, never throw.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

/* three shapes of node, only one of which speaks the modern API */
const withAsync = {
  id: "a", name: "Frame with interactions", type: "FRAME", visible: true, locked: false,
  fills: [], strokes: [], effects: [], layoutGrids: [], children: [],
  getReactionsAsync: async () => ([
    { trigger: { type: "ON_CLICK" }, actions: [{ type: "NODE", navigation: "NAVIGATE", destinationId: "3:4" }] },
    { trigger: { type: "AFTER_TIMEOUT", timeout: 800 }, actions: [{ type: "BACK" }] }
  ]),
  setReactionsAsync: async () => {}
};
const withLegacyArray = {
  id: "b", name: "Older node", type: "FRAME", visible: true, locked: false,
  fills: [], strokes: [], effects: [], layoutGrids: [], children: [],
  reactions: [{ trigger: { type: "ON_HOVER" }, actions: [{ type: "URL", url: "https://example.com" }] }]
};
const withNeither = {
  id: "c", name: "Node that cannot hold any", type: "SLICE", visible: true, locked: false,
  fills: [], strokes: [], effects: [], children: []
  // no getReactionsAsync, no reactions — this is what threw
};

const page = P.mkNode({ id: "page", name: "Page 1", type: "PAGE",
  children: [withAsync, withLegacyArray, withNeither] });
page.selection = [];
page.on = () => {}; page.off = () => {};
page.loadAsync = async () => {}; page.findAll = () => []; page.findAllWithCriteria = () => [];
f.root.children = [page]; f.currentPage = page; f.root.id = "doc-proto";
f.getLocalPaintStylesAsync = async () => [];
f.variables.getLocalVariableCollectionsAsync = async () => [];

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const last = (type) => P.posted.filter((m) => m.type === type).pop();

(async () => {
  /* the node that used to throw */
  page.selection = [withNeither];
  P.posted.length = 0;
  await P.send({ type: "getReactions" });
  await wait(20);
  let msg = last("reactions");
  console.log("node without reactions →", JSON.stringify(msg && msg.reactions));
  P.expect("asking a node that has none does not throw", !!msg);
  P.expect("it reports an empty list", msg.reactions.length === 0);

  /* the modern path still works */
  page.selection = [withAsync];
  P.posted.length = 0;
  await P.send({ type: "getReactions" });
  await wait(20);
  msg = last("reactions");
  console.log("\nmodern node →");
  (msg.reactions || []).forEach((r) => console.log("  " + r.trigger + " → " + r.actions.join(", ")));
  P.expect("both interactions are read", msg.reactions.length === 2);
  P.expect("the trigger is described", msg.reactions[0].trigger === "On click");
  P.expect("the delay is included", /800ms/.test(msg.reactions[1].trigger));

  /* and the deprecated array is still honoured */
  page.selection = [withLegacyArray];
  P.posted.length = 0;
  await P.send({ type: "getReactions" });
  await wait(20);
  msg = last("reactions");
  console.log("\nlegacy node →", msg.reactions.map((r) => r.trigger + " → " + r.actions.join(", ")).join("; "));
  P.expect("the deprecated reactions array is read too", msg.reactions.length === 1);

  /* a mixed selection must not be derailed by the one that cannot answer */
  page.selection = [withAsync, withNeither, withLegacyArray];
  P.posted.length = 0;
  await P.send({ type: "getReactions" });
  await wait(20);
  msg = last("reactions");
  console.log("\nmixed selection → " + msg.reactions.length + " interactions");
  P.expect("a mixed selection returns everything readable", msg.reactions.length === 3);

  /* removing from a node that cannot hold interactions is refused, not thrown */
  P.posted.length = 0;
  await P.send({ type: "removeReaction", nodeId: "c", index: 0 });
  await wait(20);
  const notes = P.posted.filter((m) => m.notify);
  console.log("\nremoving from an unsupported node says:", JSON.stringify(notes.map((n) => n.notify)));
  P.expect("it is refused with a message, not an exception", notes.length === 1);
  P.posted.length = 0;                          // that notify was the expected outcome

  P.finish();
})().catch((e) => {
  console.error("FAIL:", e.stack.split("\n").slice(0, 3).join(" | "));
  process.exit(1);
});
