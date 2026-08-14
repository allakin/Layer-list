/*
 * Bulk rename from the search field, in both of its targets: the layer name and
 * the text inside a text layer.
 *
 * The batch is the interesting part. Between the panel listing the matches and
 * the write landing there is an await per node — one per font load in the text
 * case — so any of them may be gone, and some nodes refuse the write outright:
 * an instance sublayer throws on .name exactly as it throws on .children.
 * Neither may abort the rest of the batch, and neither may escape as a plugin
 * error; the failures are reported instead.
 *
 * Writing .characters without loading the node's fonts first throws in Figma, so
 * the stub here throws too — that is the whole point of the second half.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

const rect = (id, name) => ({ id, name, type: "RECTANGLE", fills: [], strokes: [], effects: [] });

const loaded = new Set();
f.loadFontAsync = async (fn) => { loaded.add(fn.family + "|" + fn.style); };

/* A text node that refuses .characters until every font it uses is loaded. */
function textNode(id, name, chars, fonts) {
  let value = chars;
  const n = { id, name, type: "TEXT", fills: [], strokes: [], effects: [],
    fontName: fonts.length > 1 ? f.mixed : fonts[0],
    getStyledTextSegments: () => fonts.map((fn) => ({ fontName: fn })) };
  Object.defineProperty(n, "characters", {
    get: () => value,
    set(v) {
      for (const fn of fonts) {
        if (!loaded.has(fn.family + "|" + fn.style)) {
          throw new Error('in set_characters: Cannot write to node with unloaded font "' + fn.family + " " + fn.style + '"');
        }
      }
      value = v;
    }
  });
  return n;
}

const inter = { family: "Inter", style: "Regular" };
const interBold = { family: "Inter", style: "Bold" };

/* A node whose name cannot be written, the way Figma refuses one inside an
   instance. Reading it back for the error message throws too. */
const readonlyNode = { id: "ro", type: "RECTANGLE", fills: [], strokes: [], effects: [],
  get name() { throw new Error("in get_name: The node is not editable"); },
  set name(v) { throw new Error("in set_name: Cannot write to node inside an instance"); } };

/* A node that dies after the panel listed it but before the write. */
const doomed = rect("doomed", "btn ghost");

/* one font, and one with a bold run in the middle — both have to be loaded */
const plain = textNode("t1", "Monium", "Monium", [inter]);
const mixedFonts = textNode("t2", "Heading", "Monium is here", [inter, interBold]);

const page = P.mkNode({ id: "page", name: "Page 1", type: "PAGE", children: [
  rect("b1", "btn primary"),
  rect("b2", "Btn secondary"),
  rect("x1", "Label"),
  readonlyNode,
  doomed,
  plain,
  mixedFonts
] });
page.selection = [];
page.loadAsync = async () => {};
page.on = (t, fn) => { P.pageEvents[t] = fn; };
page.off = () => {};
page.findAllWithCriteria = () => [];
page.findAll = (pred) => page.children.filter((n) => {
  try { return pred(n); } catch (e) { return false; }   // readonlyNode throws on .name
});
f.root.children = [page]; f.currentPage = page; f.root.id = "doc-rename-found";

let undos = 0;
f.commitUndo = () => { undos++; };

const uncaught = [];
process.on("uncaughtException", (e) => uncaught.push("uncaught: " + e.message.slice(0, 60)));
process.on("unhandledRejection", (e) => uncaught.push("unhandled: " + String(e && e.message).slice(0, 60)));

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nameOf = (id) => { try { return P.nodesById.get(id).name; } catch (e) { return "(unreadable)"; } };

(async () => {
  await P.send({ type: "ready" });
  await wait(100);

  /* 1. the search itself, which is what the panel renames from */
  P.posted.length = 0;
  await P.send({ type: "search", term: "btn" });
  await wait(50);
  const found = P.posted.filter((m) => m.type === "layers").pop();
  console.log("search rows:", found.rows.map((r) => r.name).join(", "));
  P.expect("the search is case-insensitive", found.rows.length === 3);
  P.expect("the panel is told it is searching", found.searching === true);

  /* 2. the batch, with one dead node and one that refuses the write */
  doomed.removed = true;
  P.posted.length = 0;
  undos = 0;
  await P.send({ type: "renameMatches", renames: [
    { id: "b1", name: "Button primary" },
    { id: "b2", name: "Button secondary" },
    { id: "ro", name: "Button broken" },
    { id: "doomed", name: "Button ghost" },
    { id: "gone", name: "Button missing" }
  ] });
  await wait(80);

  console.log("b1 ->", nameOf("b1"), "| b2 ->", nameOf("b2"));
  P.expect("the layers before the failure are renamed", nameOf("b1") === "Button primary");
  P.expect("and the ones after it too", nameOf("b2") === "Button secondary");
  P.expect("one undo step for the whole batch", undos === 1);

  const notes = P.posted.filter((m) => m.notify).map((m) => m.notify);
  console.log("toast:", notes.length ? notes : "(none)");
  P.expect("the refused write is reported, not swallowed",
    notes.some((m) => /Couldn't change/.test(m)));
  P.expect("nothing escaped as a plugin error",
    P.posted.filter((m) => m.type === "error").length === 0 && uncaught.length === 0);

  /* 3. the tree is pushed again — and the renamed layers drop out of the search,
        because they no longer match the term that found them */
  const after = P.posted.filter((m) => m.type === "layers").pop();
  console.log("rows after:", after ? after.rows.map((r) => r.name).join(", ") : "(no push)");
  P.expect("the layer list is pushed again", !!after && after.searching === true);
  P.expect("the renamed layers no longer match the search",
    !after.rows.some((r) => r.name === "btn primary" || r.name === "Btn secondary"));

  /* 4. the text target: the panel needs the characters to preview them */
  P.posted.length = 0;
  await P.send({ type: "search", term: "Monium" });
  await wait(50);
  const textRows = P.posted.filter((m) => m.type === "layers").pop().rows;
  console.log("\nsearch rows:", textRows.map((r) => r.name + " [" + (r.text == null ? "—" : r.text) + "]").join(", "));
  P.expect("text layers carry their content", textRows.some((r) => r.text === "Monium"));
  P.expect("a text layer is found by what it says, not only by what it is called",
    textRows.some((r) => r.name === "Heading" && r.text === "Monium is here"));
  P.expect("everything else carries none", textRows.every((r) => r.type === "TEXT" || r.text === undefined));

  /* 5. writing it, which means loading every font in the node first */
  P.posted.length = 0;
  undos = 0;
  await P.send({ type: "renameMatches", target: "text", renames: [
    { id: "t1", name: "Monium1" },
    { id: "t2", name: "Monium1 is here" },
    { id: "b1", name: "not a text layer" }
  ] });
  await wait(80);

  console.log("t1 ->", JSON.stringify(plain.characters), "| t2 ->", JSON.stringify(mixedFonts.characters));
  console.log("fonts loaded:", [...loaded].join(", "));
  P.expect("the text is rewritten, not the layer name", plain.characters === "Monium1" && plain.name === "Monium");
  P.expect("a node with several fonts has all of them loaded first",
    mixedFonts.characters === "Monium1 is here");
  P.expect("both weights were loaded", loaded.has("Inter|Regular") && loaded.has("Inter|Bold"));
  P.expect("a layer that is not text is left alone", P.nodesById.get("b1").name === "Button primary");
  P.expect("one undo step for the batch", undos === 1);
  const tnotes = P.posted.filter((m) => m.notify).map((m) => m.notify);
  console.log("toast:", tnotes.length ? tnotes : "(none)");
  P.expect("the count reported is of what was written", tnotes.some((m) => /2 text layers/.test(m)));

  /* 6. an empty batch is a no-op, not a toast */
  P.posted.length = 0;
  undos = 0;
  await P.send({ type: "renameMatches", renames: [] });
  await wait(40);
  console.log("empty batch toasts:", P.posted.filter((m) => m.notify).length);
  P.expect("an empty batch changes nothing", undos === 0);
  P.expect("and says nothing", P.posted.filter((m) => m.notify).length === 0);

  console.log("\nuncaught/unhandled:", uncaught.length ? uncaught : "(none)");
  P.posted.length = 0;             // the reported failure above is the expected result
  P.finish();
})().catch((e) => {
  console.error("FAIL:", e.stack.split("\n").slice(0, 3).join(" | "));
  process.exit(1);
});
