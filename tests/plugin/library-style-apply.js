/*
 * Applying a style from the picker.
 *
 * The report was a Figma toast reading
 *
 *     Line 7: Cannot set style successfully: Cannot find style
 *
 * The design-system index remembers a library style by the id it had when it was
 * indexed — but that id is a *local instance* of the library's style, and Figma
 * drops it again as soon as nothing in the file uses it. The index survives in
 * clientStorage across sessions; the id does not. The key does, which is why a
 * library token has always been bound through `importVariableByKeyAsync`. Library
 * styles turned out to need the same, through `importStyleByKeyAsync`.
 *
 * So: a library entry is applied by key, a local one by id, and an id that has
 * gone is reported in words that say what to do about it.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

const LIVE_IDS = new Set(["S:local-grey"]);          // what this file still has
let imported = [];                                   // keys asked for, in order

f.importStyleByKeyAsync = async (key) => {
  imported.push(key);
  if (key !== "danger-light-hover-key") throw new Error("Unable to create style");
  // Importing gives the style a fresh local id in this document.
  LIVE_IDS.add("S:imported-fresh");
  return { id: "S:imported-fresh", key: key, name: "Danger Light Hover", type: "PAINT" };
};

let applied = [];
function target(id, name) {
  const n = P.mkNode({
    id: id, name: name, type: "FRAME", layoutMode: "NONE",
    x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, blendMode: "PASS_THROUGH",
    fills: [], strokes: [], effects: [], exportSettings: [], boundVariables: {},
    constraints: { horizontal: "MIN", vertical: "MIN" }, strokeStyleId: "", fillStyleId: ""
  });
  n.setFillStyleIdAsync = async (styleId) => {
    if (styleId !== "" && !LIVE_IDS.has(styleId)) {
      throw new Error("Cannot set style successfully: Cannot find style");
    }
    applied.push(styleId);
    n.fillStyleId = styleId;
  };
  return n;
}

const line7 = target("line7", "Line 7");
const page = P.mkNode({ id: "page", name: "Page 1", type: "PAGE", children: [line7] });
page.selection = [line7]; page.on = () => {}; page.off = () => {};
page.loadAsync = async () => {}; page.findAll = () => [];
f.root.children = [page]; f.currentPage = page;

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const notes = () => P.posted.filter((m) => m.notify).map((m) => m.notify);
/* The panel sends the id as the value and, for a library entry, the key as extra. */
const applyStyle = (id, key) =>
  P.send({ type: "update", key: "style.fill", value: id, index: null, extra: key, commit: true });

(async () => {
  /* ---- the reported case: a library style whose remembered id has gone ---- */
  P.posted.length = 0; applied = []; imported = [];
  await applyStyle("S:stale-from-the-index", "danger-light-hover-key");
  console.log("keys imported:", JSON.stringify(imported), "| ids applied:", JSON.stringify(applied),
    "| said:", JSON.stringify(notes()));
  P.expect("the style was imported by key", imported.length === 1);
  P.expect("and the fresh id is what was applied",
    applied.length === 1 && applied[0] === "S:imported-fresh");
  P.expect("the stale id was never sent to the document",
    applied.indexOf("S:stale-from-the-index") === -1);
  P.expect("nothing was reported to the user", notes().length === 0);
  P.expect("and the layer ended up carrying the style", line7.fillStyleId === "S:imported-fresh");

  /* ---- a local style is applied by id, with no import ---- */
  P.posted.length = 0; applied = []; imported = [];
  await applyStyle("S:local-grey", null);
  console.log("local style -> imported:", JSON.stringify(imported), "applied:", JSON.stringify(applied));
  P.expect("no key, no import — the id is the real thing here", imported.length === 0);
  P.expect("and it was applied", applied[0] === "S:local-grey");

  /* ---- detaching ---- */
  P.posted.length = 0; applied = []; imported = [];
  await applyStyle("", null);
  console.log("detach -> applied:", JSON.stringify(applied));
  P.expect("an empty id still detaches", applied[0] === "");
  P.expect("without importing anything", imported.length === 0);

  /* ---- an id that has gone, with no key to fall back on ---- */
  P.posted.length = 0; applied = []; imported = [];
  await applyStyle("S:gone", null);
  console.log("dead local id -> said:", JSON.stringify(notes()));
  P.expect("the failure is reported", notes().length === 1);
  P.expect("it names the layer, as the toast did", /Line 7/.test(notes()[0]));
  P.expect("and says what is wrong in words that suggest what to do",
    /not in this file any more/.test(notes()[0]) && !/Cannot set style successfully/.test(notes()[0]));

  /* ---- a key that no longer resolves, but an id that still works ---- */
  /* The import throws; the id is tried anyway, because it may still be good. It
     works here — and that is still worth saying, because the index is out of date
     and the next session will not be so lucky. Swallowing this was what turned a
     library style into a button that did nothing. */
  P.posted.length = 0; applied = []; imported = [];
  await applyStyle("S:local-grey", "a-key-nobody-published");
  console.log("bad key, good id -> imported:", JSON.stringify(imported),
    "applied:", JSON.stringify(applied), "| said:", JSON.stringify(notes()));
  P.expect("the key was tried", imported.length === 1);
  P.expect("and the id carried it through anyway", applied[0] === "S:local-grey");
  P.expect("with the stale index mentioned, not passed over in silence",
    notes().length === 1 && /re-index/.test(notes()[0]));

  /* ---- both halves failing says what each of them said ---- */
  P.posted.length = 0; applied = []; imported = [];
  await applyStyle("S:gone", "a-key-nobody-published");
  console.log("bad key, dead id -> said:", JSON.stringify(notes()));
  P.expect("the failure is reported", notes().length === 1);
  P.expect("it names the layer", /Line 7/.test(notes()[0]));
  P.expect("says the import failed", /Unable to create style/.test(notes()[0]));
  P.expect("and says the remembered id is stale too",
    /stale/.test(notes()[0]) && /Cannot find style/.test(notes()[0]));

  /* ---- a key that resolves to the wrong kind of style ---- */
  P.posted.length = 0; applied = []; imported = [];
  f.importStyleByKeyAsync = async (key) => {
    imported.push(key);
    return { id: "S:a-text-style", key: key, name: "Heading/H2", type: "TEXT" };
  };
  await applyStyle("S:local-grey", "text-style-key");
  console.log("wrong kind of style ->", JSON.stringify(notes()), "| applied:", JSON.stringify(applied));
  P.expect("nothing was applied", applied.length === 0);
  P.expect("and it says what kind it actually is",
    notes().length === 1 && /text style, not paint/.test(notes()[0]));

  P.posted.length = 0;
  P.finish();
})().catch((e) => { console.error("FAIL:", e.stack); process.exit(1); });
