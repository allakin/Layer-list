/*
 * "I see only the layers panel and the layers are duplicated."
 *
 * A slot inside an instance can hold the very instance that contains it, so the
 * same id turns up as its own descendant. The walk followed it about a thousand
 * levels deep, filled the list to MAX_ROWS with the same four layers over and
 * over, and — because a row is as wide as its content — made the tree thousands
 * of pixels wide, which squeezed the inspector to zero.
 *
 * The branch has to end where it starts repeating, and alt-expanding it must not
 * recurse forever either.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

const inner = P.mkNode({ id: "inner", name: "Frame 2131329723", type: "FRAME", layoutMode: "NONE", children: [] });
const dialog = P.mkNode({ id: "dialog", name: "Dialog", type: "INSTANCE", children: [
  { id: "bg", name: ".Background", type: "INSTANCE" },
  P.mkNode({ id: "content", name: "Content", type: "SLOT", children: [inner] })
]});

const page = P.mkNode({ id: "page", name: "В работе", type: "PAGE", children: [dialog] });
page.on = () => {}; page.off = () => {};
page.loadAsync = async () => {}; page.findAll = () => []; page.findAllWithCriteria = () => [];
page.selection = [];
f.root.children = [page]; f.root.id = "doc-self-nesting";
f.currentPage = page;

/* The loop, added after the tree was built so nothing walks into it while it is
   being registered. Only children[] loops: dialog.parent stays the page, which
   is what makes this survivable at all — the walk upwards still terminates. */
inner.children.push(dialog);

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function layers() {
  P.posted.length = 0;
  await P.send({ type: "refresh" });
  await wait(20);
  const m = P.posted.filter((x) => x.type === "layers").pop();
  if (!m) throw new Error("no layers message");
  return m;
}

(async () => {
  for (const id of ["dialog", "content", "inner"]) {
    await P.send({ type: "setExpanded", id, expanded: true });
  }
  const L = await layers();
  console.log("rows (" + L.rows.length + "):");
  L.rows.forEach((r) => console.log("  " + " ".repeat(r.depth * 2) + r.name +
    (r.cycle ? "   ← repeats itself" : "") + (r.hasChildren ? "  ▸" : "")));

  P.expect("the walk ends instead of filling the list", L.rows.length < 20);
  P.expect("nothing was truncated at MAX_ROWS", L.truncated === false);
  P.expect("the deepest row stays shallow", Math.max(...L.rows.map((r) => r.depth)) <= 3);

  const repeats = L.rows.filter((r) => r.id === "dialog");
  P.expect("the repeat is still shown, once", repeats.length === 2);
  P.expect("the second one is flagged as a loop", !!repeats[1].cycle);
  P.expect("and offers no caret to open again", repeats[1].hasChildren === false);
  P.expect("the first one is untouched", !repeats[0].cycle && repeats[0].hasChildren === true);

  /* alt-click on the caret: a deep expand walked children[] with no memory */
  await P.send({ type: "setExpanded", id: "dialog", expanded: true, deep: true });
  const L2 = await layers();
  console.log("\nafter alt-expand: " + L2.rows.length + " rows, deepest " +
    Math.max(...L2.rows.map((r) => r.depth)));
  P.expect("a deep expand survives the loop", L2.rows.length < 20);

  P.finish();
})().catch((e) => {
  console.error("FAIL:", e.stack.split("\n").slice(0, 3).join(" | "));
  process.exit(1);
});
