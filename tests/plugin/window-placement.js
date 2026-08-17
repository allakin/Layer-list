/*
 * The panel's size and position across sessions.
 *
 * Both are the user's, not the document's, so they live in figma.clientStorage:
 * on this machine, for this person, outside the .fig file and outside the
 * repository. A plugin has no filesystem, so there is no settings file anywhere
 * for git to see.
 *
 * Two things this has to get right:
 *
 *   - the order. Reading storage is asynchronous, so a window shown first paints
 *     once at 660x760 wherever Figma put it and then jumps. It starts hidden and
 *     is shown only once it has been sized and placed;
 *   - the coordinates. reposition() takes canvas coordinates, but what the user
 *     arranged is a place on screen; canvas coordinates for that place depend on
 *     the current scroll and zoom, so saving them would move the window in the
 *     next file. Window space is saved, and converted on the way back through
 *     one getPosition(), which answers in both spaces for the same point.
 *
 * The conversion is what the numbers here are for: the window was left at
 * (300, 120) on screen; Figma has reopened it at (100, 60) on screen, which is
 * (500, 200) on the canvas, at zoom 2. 200 screen pixels right is 100 canvas
 * units right, 60 down is 30 down, so it belongs at (600, 230).
 */
const P = require("../harness/plugin.js");
const f = global.figma;
const CODE = require("path").join(__dirname, "..", "..", "plugin", "code.js");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* what the previous session left behind */
P.clientStore["ui-size"] = { w: 420, h: 900 };
P.clientStore["ui-pos"] = { x: 300, y: 120 };
P.setUiPosition({ x: 100, y: 60 }, { x: 500, y: 200 });
f.viewport.zoom = 2;

const page = P.mkNode({ id: "page", name: "Page 1", type: "PAGE", children: [] });
page.selection = []; page.on = () => {}; page.off = () => {};
page.loadAsync = async () => {}; page.findAll = () => [];
f.root.children = [page]; f.currentPage = page;

require(CODE);

const calls = () => P.uiLog.map((c) => c.call).join(" -> ");
const find = (name) => P.uiLog.filter((c) => c.call === name);

(async () => {
  await wait(60);
  console.log("window calls:", calls());

  const shown = find("showUI")[0];
  console.log("showUI options:", JSON.stringify(shown && shown.opts));
  P.expect("the window is created hidden", !!shown && shown.opts.visible === false);
  P.expect("at the default size, which the saved one overrides",
    shown.opts.width === 660 && shown.opts.height === 760);

  const order = P.uiLog.map((c) => c.call);
  P.expect("it is shown exactly once", find("show").length === 1);
  P.expect("the saved size is applied before it is shown",
    order.indexOf("resize") > -1 && order.indexOf("resize") < order.indexOf("show"));
  P.expect("and so is the saved position",
    order.indexOf("reposition") > -1 && order.indexOf("reposition") < order.indexOf("show"));

  const sized = find("resize")[0];
  console.log("resized to:", sized.w + "x" + sized.h);
  P.expect("the size is the one that was saved", sized.w === 420 && sized.h === 900);

  const placed = find("reposition")[0];
  console.log("repositioned to:", placed.x + "," + placed.y, "(canvas space, zoom 2)");
  P.expect("the saved screen position is converted through the zoom",
    placed.x === 600 && placed.y === 230);

  /* ---- what the poll writes, and what it does not ---- */
  /* The first reading is the position just restored, so there is nothing to
     save; opening the plugin must not write anything on its own. */
  delete P.clientStore["ui-pos"];
  await wait(1200);
  console.log("after a tick with the window untouched:", JSON.stringify(P.clientStore["ui-pos"]));
  P.expect("a window nobody moved is not written back", P.clientStore["ui-pos"] === undefined);

  P.setUiPosition({ x: 640, y: 300 }, { x: 500, y: 200 });
  await wait(1600);
  console.log("after the user dragged it:", JSON.stringify(P.clientStore["ui-pos"]));
  P.expect("a window that moved is saved, in window space",
    !!P.clientStore["ui-pos"] && P.clientStore["ui-pos"].x === 640 && P.clientStore["ui-pos"].y === 300);

  /* ---- the size write is debounced ---- */
  /* The grip sends one message per pointer move; each used to be its own write. */
  P.clientStore["ui-size"] = { w: 0, h: 0 };
  let writes = 0;
  const realSet = f.clientStorage.setAsync;
  f.clientStorage.setAsync = async (k, v) => { if (k === "ui-size") writes++; return realSet(k, v); };
  for (let w = 700; w < 740; w++) await P.send({ type: "resize", w: w, h: 800 });
  console.log("40 resize messages ->", writes, "writes so far");
  P.expect("a drag of the grip does not write once per pointer move", writes === 0);
  await wait(600);
  console.log("after it settles:", writes, "write of", JSON.stringify(P.clientStore["ui-size"]));
  P.expect("it is written once, when the drag stops", writes === 1);
  P.expect("with the size it ended at", P.clientStore["ui-size"].w === 739);
  f.clientStorage.setAsync = realSet;

  /* the resize case still refuses to make the panel unusably small */
  await P.send({ type: "resize", w: 10, h: 10 });
  const small = find("resize").pop();
  console.log("asked for 10x10, got:", small.w + "x" + small.h);
  P.expect("the panel still stops at its minimum", small.w === 260 && small.h === 320);

  /* ---- storage that will not answer must not cost the panel ---- */
  /* The only way to see another boot is to run the module again. It is the last
     thing this file does, because it registers a second set of handlers. */
  P.uiLog.length = 0;
  f.clientStorage.getAsync = async () => { throw new Error("storage unavailable"); };
  delete require.cache[require.resolve(CODE)];
  require(CODE);
  await wait(60);
  console.log("boot with unreadable storage:", calls());
  P.expect("the panel is shown even when nothing can be read", find("show").length === 1);
  P.expect("with no size or position to apply",
    find("resize").length === 0 && find("reposition").length === 0);

  P.finish();
})().catch((e) => { console.error("FAIL:", e.stack); process.exit(1); });
