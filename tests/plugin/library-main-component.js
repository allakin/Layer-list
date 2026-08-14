/*
 * "Go to main component" on an instance of a library component.
 *
 * getMainComponentAsync answers for a library instance too, so the `!main`
 * guard never fired — but the node it hands back sits in no page of this
 * document, and assigning it crashed the action with Figma's
 * "in set_selection: The selection of a page can only include nodes in that
 * page". The action has to say the component lives in a library instead. A main
 * component on another page still has to switch pages and select.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

/* Figma's own rule, so a bad assignment fails here exactly as in the editor. */
function guardSelection(page) {
  let sel = [];
  Object.defineProperty(page, "selection", {
    get: () => sel,
    set(nodes) {
      for (const n of nodes) {
        let p = null;
        try { p = n.parent; while (p && p.type !== "PAGE") p = p.parent; } catch (e) { p = null; }
        if (p !== page) {
          throw new Error("in set_selection: The selection of a page can only include nodes in that page");
        }
      }
      sel = nodes.slice();
    }
  });
}

const geom = () => ({
  visible: true, locked: false, x: 0, y: 0, width: 100, height: 40, rotation: 0,
  opacity: 1, blendMode: "NORMAL", fills: [], strokes: [], effects: [], exportSettings: [],
  constraints: { horizontal: "MIN", vertical: "MIN" }, boundVariables: {}
});

/* a published component: reachable, but hanging off nothing */
const libMain = {
  id: "lib:1", name: "Button", type: "COMPONENT", remote: true, removed: false,
  description: "From the design system", parent: null
};

/* the same situation where even reading .parent throws */
const deadMain = {
  id: "lib:2", name: "Chip", type: "COMPONENT", removed: false, description: "",
  get parent() { throw new Error("The node is not part of the document"); }
};

const localMain = { id: "localMain", name: "Card", type: "COMPONENT", description: "", remote: false, ...geom(), children: [] };

const libInst = { id: "libInst", name: "Button", type: "INSTANCE", ...geom(), children: [], componentProperties: {}, getMainComponentAsync: async () => libMain };
const deadInst = { id: "deadInst", name: "Chip", type: "INSTANCE", ...geom(), children: [], componentProperties: {}, getMainComponentAsync: async () => deadMain };
const localInst = { id: "localInst", name: "Card", type: "INSTANCE", ...geom(), children: [], componentProperties: {}, getMainComponentAsync: async () => localMain };

const page1 = P.mkNode({ id: "page1", name: "Page 1", type: "PAGE", children: [libInst, deadInst, localInst] });
const page2 = P.mkNode({ id: "page2", name: "Page 2", type: "PAGE", children: [localMain] });
for (const pg of [page1, page2]) {
  pg.on = () => {}; pg.off = () => {};
  pg.loadAsync = async () => {}; pg.findAll = () => []; pg.findAllWithCriteria = () => [];
  guardSelection(pg);
}
f.root.children = [page1, page2]; f.root.id = "doc-library-main";
f.currentPage = page1;
f.setCurrentPageAsync = async (pg) => { f.currentPage = pg; };

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function goToMain(id) {
  P.posted.length = 0;
  await P.send({ type: "action", action: "goToMain", ids: [id] });
  await wait(20);
  return {
    errors: P.posted.filter((m) => m.type === "error").map((m) => m.message),
    notes: P.posted.filter((m) => m.notify).map((m) => m.notify)
  };
}

(async () => {
  /* 1. a library component: a toast, not a crash */
  page1.selection = [libInst];
  let r = await goToMain("libInst");
  console.log("library instance → errors:", r.errors.length ? r.errors : "(none)");
  console.log("                   toast :", r.notes.length ? r.notes : "(none)");
  P.expect("a library main component does not throw", r.errors.length === 0);
  P.expect("the panel is told where the component lives", r.notes.some((m) => /library/i.test(m)));
  P.expect("the selection is left alone", page1.selection.map((n) => n.id).join() === "libInst");
  P.expect("the page did not change", f.currentPage === page1);

  /* 2. the same when the node cannot even be walked upwards */
  page1.selection = [deadInst];
  r = await goToMain("deadInst");
  console.log("\nunreachable main  → errors:", r.errors.length ? r.errors : "(none)");
  console.log("                   toast :", r.notes.length ? r.notes : "(none)");
  P.expect("reading .parent through a dead reference does not throw", r.errors.length === 0);
  P.expect("that case is reported too", r.notes.some((m) => /library/i.test(m)));

  /* 3. a main component on another page still works */
  page1.selection = [localInst];
  r = await goToMain("localInst");
  console.log("\nmain on Page 2    → errors:", r.errors.length ? r.errors : "(none)");
  console.log("                    page  :", f.currentPage.name,
    "| selection:", page2.selection.map((n) => n.name).join(", ") || "(none)");
  P.expect("the page holding the main component is opened", f.currentPage === page2);
  P.expect("the main component ends up selected", page2.selection.map((n) => n.id).join() === "localMain");
  P.expect("no toast for the case that works", r.notes.length === 0);

  P.posted.length = 0;             // the two toasts above are the expected result
  P.finish();
})().catch((e) => {
  console.error("FAIL:", e.stack.split("\n").slice(0, 3).join(" | "));
  process.exit(1);
});
