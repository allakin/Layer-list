/*
 * Applying a token from the library to a padding.
 *
 * A library-only token is listed with the id `libvar:<key>` and imported at the
 * moment it is bound, because it does not exist in this file until then. That
 * import can fail on its own — unpublished, renamed, or the file no longer
 * subscribes to the library — and it threw out of `bindVariable` into the message
 * router, which said `[bindVariable] …` and a stack: an error about a message
 * type, for a user who clicked a token in a picker.
 *
 * The bind itself fails per layer and per field, and a padding control stands for
 * two fields across however many layers are selected. "Can't bind token" alone
 * could not tell "this layer has no auto layout" from "this token is gone", and
 * it went only to a Figma toast — three seconds over the canvas, not copyable,
 * nowhere near the control that did nothing. Every failure names the layer, the
 * field and the reason, in the panel's error bar as well as the toast.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

let imported = [];
const LIB = { "g-spacing-4-key": { id: "VariableID:imported", key: "g-spacing-4-key", name: "g-spacing-4", resolvedType: "FLOAT" } };

f.variables.importVariableByKeyAsync = async (key) => {
  imported.push(key);
  const v = LIB[key];
  if (!v) throw new Error("No variable found for key " + key);
  return v;
};
f.variables.getVariableByIdAsync = async (id) =>
  id === "VariableID:local" ? { id: id, name: "spacing/4", resolvedType: "FLOAT" } : null;

/* An auto-layout frame takes a padding token; one without auto layout refuses,
   the way the document does. */
function frame(id, name, auto) {
  const n = P.mkNode({
    id: id, name: name, type: "FRAME",
    layoutMode: auto ? "VERTICAL" : "NONE", layoutWrap: "NO_WRAP",
    itemSpacing: 8, paddingTop: 12, paddingRight: 16, paddingBottom: 12, paddingLeft: 16,
    primaryAxisAlignItems: "MIN", counterAxisAlignItems: "MIN",
    x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1, blendMode: "PASS_THROUGH",
    fills: [], strokes: [], effects: [], exportSettings: [], layoutGrids: [],
    fillStyleId: "", strokeStyleId: "", effectStyleId: "", gridStyleId: "",
    boundVariables: {}, constraints: { horizontal: "MIN", vertical: "MIN" }, children: []
  });
  n.setBoundVariable = (field, variable) => {
    if (!auto && /^padding/.test(field)) {
      throw new Error("Cannot bind variable to " + field + ": node has no auto layout");
    }
    if (variable) n.boundVariables[field] = { type: "VARIABLE_ALIAS", id: variable.id };
    else delete n.boundVariables[field];
  };
  return n;
}

const drawer = frame("drawer", "Drawer", true);
const plain = frame("plain", "Rectangle holder", false);
const page = P.mkNode({ id: "page", name: "Page 1", type: "PAGE", children: [drawer, plain] });
page.selection = [drawer]; page.on = () => {}; page.off = () => {};
page.loadAsync = async () => {}; page.findAll = () => [];
f.root.children = [page]; f.currentPage = page;

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const notes = () => P.posted.filter((m) => m.notify).map((m) => m.notify);
const bar = () => P.posted.filter((m) => m.type === "error").map((m) => m.message);
/* What the picker sends: the padding control binds both sides at once. */
const bind = (variableId) => P.send({
  type: "bindVariable", field: ["paddingTop", "paddingBottom"], variableId: variableId
});

(async () => {
  /* ---- a library token, imported by key and bound to both sides ---- */
  P.posted.length = 0; imported = [];
  await bind("libvar:g-spacing-4-key");
  console.log("keys imported:", JSON.stringify(imported),
    "| bound:", JSON.stringify(drawer.boundVariables), "| said:", JSON.stringify(notes()));
  P.expect("the token was imported by key, not looked up by id", imported.length === 1);
  P.expect("both sides of the padding took it",
    drawer.boundVariables.paddingTop.id === "VariableID:imported" &&
    drawer.boundVariables.paddingBottom.id === "VariableID:imported");
  P.expect("and nothing was reported", notes().length === 0 && bar().length === 0);

  /* ---- a local token is bound by id, with no import ---- */
  P.posted.length = 0; imported = [];
  await bind("VariableID:local");
  console.log("local token -> imported:", JSON.stringify(imported),
    "| bound:", JSON.stringify(drawer.boundVariables.paddingTop));
  P.expect("no key, no import", imported.length === 0);
  P.expect("the local variable is what got bound",
    drawer.boundVariables.paddingTop.id === "VariableID:local");

  /* ---- detaching ---- */
  P.posted.length = 0;
  await bind(null);
  console.log("detach -> bound:", JSON.stringify(drawer.boundVariables), "| said:", JSON.stringify(notes()));
  P.expect("both sides let go", !drawer.boundVariables.paddingTop && !drawer.boundVariables.paddingBottom);
  P.expect("quietly", notes().length === 0);

  /* ---- the key no longer resolves: the reported case ---- */
  P.posted.length = 0; imported = [];
  await bind("libvar:a-key-nobody-published");
  console.log("dead key -> said:", JSON.stringify(notes()), "| bar:", JSON.stringify(bar()));
  P.expect("the failure is reported", notes().length === 1);
  P.expect("as being about the token, not about a message type",
    /token/i.test(notes()[0]) && !/\[bindVariable\]/.test(notes()[0]));
  P.expect("it says why the import failed", /No variable found for key/.test(notes()[0]));
  P.expect("and it reaches the panel's error bar, where it can be copied",
    bar().length === 1 && /No variable found for key/.test(bar()[0]));
  P.expect("nothing was bound", !drawer.boundVariables.paddingTop);

  /* ---- several layers, one of which cannot take it ---- */
  P.posted.length = 0; imported = [];
  page.selection = [drawer, plain];
  await bind("libvar:g-spacing-4-key");
  console.log("mixed selection -> said:", JSON.stringify(notes()));
  P.expect("the layer that can take it still did",
    drawer.boundVariables.paddingTop.id === "VariableID:imported");
  P.expect("the one that cannot is reported", notes().length === 1);
  P.expect("by name", /Rectangle holder/.test(notes()[0]));
  P.expect("with the field named too, since a padding stands for two",
    /paddingTop/.test(notes()[0]));
  P.expect("and the reason the document gave",
    /no auto layout/.test(notes()[0]));
  P.expect("in the bar as well", bar().length === 1 && /Rectangle holder/.test(bar()[0]));

  console.log("\nnotifications are expected in this file; failures are what matter");
  P.posted.length = 0;
  P.finish();
})().catch((e) => { console.error("FAIL:", e.stack); process.exit(1); });
