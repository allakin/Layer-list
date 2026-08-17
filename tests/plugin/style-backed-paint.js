/*
 * Changing the colour of a fill that has a paint style applied.
 *
 * This came back as a Figma toast reading
 *
 *     Frame 2087328884: undefined
 *
 * which is two bugs in one line.
 *
 * The failure: a paint style is a *link*, and `fills` is what it links to, so
 * writing the array while the link holds throws. Under
 * `documentAccess: dynamic-page` the id is read-only as well, so the only way to
 * let go of it is `setFillStyleIdAsync("")`. Picking a colour by hand is the
 * moment the user decided to stop following the style, so that is what happens —
 * and it is said out loud, because quietly cutting a layer loose from the design
 * system is not a small thing.
 *
 * The report: the word "undefined" was `e.message` on something thrown that was
 * not an Error. The sandbox throws strings and bare objects too. Nothing
 * user-facing may render one of those as "undefined" — that names neither what
 * broke nor where to look.
 */
const P = require("../harness/plugin.js");
const f = global.figma;

/* A frame whose fill follows a library style, as in the report. */
function styled(o) {
  const n = Object.assign({
    type: "FRAME", name: "Frame 2087328884", layoutMode: "NONE",
    x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1,
    blendMode: "PASS_THROUGH", visible: true, locked: false,
    strokes: [], strokeStyleId: "", effects: [], exportSettings: [],
    boundVariables: {}, constraints: { horizontal: "MIN", vertical: "MIN" }
  }, o);

  let styleId = n.fillStyleId || "";
  let fills = n.fills || [];
  // The document refuses the write while the link is in place, exactly as Figma
  // does, and the id itself cannot be assigned — only the async setter moves it.
  Object.defineProperty(n, "fillStyleId", {
    get() { return styleId; },
    set() { throw new Error("in set_fillStyleId: property is read-only in dynamic-page"); }
  });
  Object.defineProperty(n, "fills", {
    get() { return fills; },
    set(v) {
      if (styleId) throw new Error("Cannot write to fills while a style is applied");
      fills = v;
    }
  });
  n.setFillStyleIdAsync = async (id) => { styleId = id; n.detachCalls = (n.detachCalls || 0) + 1; };
  return n;
}

const styledFrame = styled({
  fillStyleId: "S:danger-light-hover",
  fills: [{ type: "SOLID", visible: true, opacity: 1, blendMode: "NORMAL", color: { r: 0.9, g: 0.2, b: 0.2 } }]
});

/* a plain frame, to be sure nothing was detached that had no style */
const plainFrame = P.mkNode({
  id: "plain", name: "Plain", type: "FRAME", layoutMode: "NONE",
  x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, blendMode: "PASS_THROUGH",
  fillStyleId: "", strokeStyleId: "", strokes: [], effects: [], exportSettings: [],
  boundVariables: {}, constraints: { horizontal: "MIN", vertical: "MIN" },
  fills: [{ type: "SOLID", visible: true, opacity: 1, blendMode: "NORMAL", color: { r: 0, g: 0, b: 0 } }]
});

/* a node that throws things that are not Errors */
const thrower = P.mkNode({
  id: "thrower", name: "Throws a string", type: "FRAME", layoutMode: "NONE",
  x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, blendMode: "PASS_THROUGH",
  fillStyleId: "", strokeStyleId: "", strokes: [], effects: [], exportSettings: [],
  boundVariables: {}, constraints: { horizontal: "MIN", vertical: "MIN" }
});
let thrown = "in set_fills: Only solid paints are supported here";
Object.defineProperty(thrower, "fills", {
  get() { return [{ type: "SOLID", visible: true, opacity: 1, blendMode: "NORMAL", color: { r: 0, g: 0, b: 0 } }]; },
  set() { throw thrown; }                    // a string, not an Error
});

P.nodesById.set(styledFrame.id = "styled", styledFrame);

const page = P.mkNode({ id: "page", name: "Page 1", type: "PAGE", children: [plainFrame, thrower] });
page.children.push(styledFrame);
styledFrame.parent = page;
page.selection = []; page.on = () => {}; page.off = () => {};
page.loadAsync = async () => {}; page.findAll = () => [];
f.root.children = [page]; f.currentPage = page;

require(require("path").join(__dirname, "..", "..", "plugin", "code.js"));

const notes = () => P.posted.filter((m) => m.notify).map((m) => m.notify);
const upd = (key, value, index, commit) =>
  P.send({ type: "update", key: key, value: value, index: index, commit: commit !== false });

(async () => {
  /* ---- the reported case ---- */
  P.posted.length = 0;
  page.selection = [styledFrame];
  await upd("fill.color", "#00FF00", 0);
  console.log("style after the edit:", JSON.stringify(styledFrame.fillStyleId),
    "| fill:", JSON.stringify(styledFrame.fills[0].color),
    "| said:", JSON.stringify(notes()));
  P.expect("the colour was applied", styledFrame.fills[0].color.g === 1);
  P.expect("the style was let go of", styledFrame.fillStyleId === "");
  P.expect("through the async setter, the only one that works here",
    styledFrame.detachCalls === 1);
  P.expect("nothing was reported as a failure",
    !notes().some((n) => /undefined/.test(n)));
  P.expect("and the detaching was said out loud",
    notes().length === 1 && /detached/i.test(notes()[0]));

  /* ---- a layer with no style is left alone ---- */
  P.posted.length = 0;
  page.selection = [plainFrame];
  await upd("fill.color", "#123456", 0);
  console.log("plain frame ->", JSON.stringify(plainFrame.fills[0].color), "| said:", JSON.stringify(notes()));
  P.expect("the colour was applied", Math.round(plainFrame.fills[0].color.r * 255) === 0x12);
  P.expect("and nothing was announced, because nothing was detached", notes().length === 0);

  /* ---- a live drag says nothing; the commit at the end does ---- */
  const styled2 = styled({
    fillStyleId: "S:another", id: "styled2", name: "Dragged",
    fills: [{ type: "SOLID", visible: true, opacity: 1, blendMode: "NORMAL", color: { r: 0, g: 0, b: 0 } }]
  });
  page.children.push(styled2); styled2.parent = page; P.nodesById.set("styled2", styled2);
  P.posted.length = 0;
  page.selection = [styled2];
  await upd("fill.color", "#FF0000", 0, false);
  await upd("fill.color", "#FF3300", 0, false);
  console.log("mid-drag notifications:", JSON.stringify(notes()));
  P.expect("a drag does not announce anything on every frame", notes().length === 0);
  P.expect("but the colour is following the pointer", styled2.fills[0].color.r === 1);

  /* ---- applying a style is not editing a paint ---- */
  P.posted.length = 0;
  const styled3 = styled({
    fillStyleId: "S:third", id: "styled3", name: "Keeps its style",
    fills: [{ type: "SOLID", visible: true, opacity: 1, blendMode: "NORMAL", color: { r: 0, g: 0, b: 0 } }]
  });
  page.children.push(styled3); styled3.parent = page; P.nodesById.set("styled3", styled3);
  page.selection = [styled3];
  await upd("strokeWeight", 4, null);
  console.log("after a stroke-geometry edit, style:", JSON.stringify(styled3.fillStyleId));
  P.expect("a key that writes no paint array leaves the link alone",
    styled3.fillStyleId === "S:third" && !styled3.detachCalls);

  /* ---- what a thrown non-Error reads as ---- */
  P.posted.length = 0;
  page.selection = [thrower];
  await upd("fill.color", "#FFFFFF", 0);
  console.log("thrown string ->", JSON.stringify(notes()));
  P.expect("the failure is reported", notes().length === 1);
  P.expect("it names the layer", /Throws a string/.test(notes()[0]));
  P.expect("and says what actually went wrong, not “undefined”",
    /Only solid paints/.test(notes()[0]) && !/undefined/.test(notes()[0]));

  P.posted.length = 0;
  thrown = { code: 5, detail: "no message property" };      // an object this time
  await upd("fill.color", "#FFFFFF", 0);
  console.log("thrown object ->", JSON.stringify(notes()));
  P.expect("an object with no message is still reported",
    notes().length === 1 && !/undefined/.test(notes()[0]));

  P.posted.length = 0;
  thrown = new Error();                                     // an Error with no message
  await upd("fill.color", "#FFFFFF", 0);
  console.log("empty Error ->", JSON.stringify(notes()));
  P.expect("so is an Error that carries no message",
    notes().length === 1 && !/undefined/.test(notes()[0]));

  console.log("\nnotifications are expected in this file; failures are what matter");
  P.posted.length = 0;
  P.finish();
})().catch((e) => { console.error("FAIL:", e.stack); process.exit(1); });
