/*
 * Three panes, three arrangements, and the dividers between them.
 *
 * The panel used to be two fixed columns. It is now Layers, Design and Scale,
 * each of which can be switched off, laid out as three columns, three rows, or
 * Layers and Design sharing a line with Scale across the bottom.
 *
 * The DOM does not change between arrangements — #row-top is `display: contents`
 * until the layout wants it to be a real box — so what is asserted here is what
 * applyLayout() writes: the class on #main, the axis of each divider, and which
 * pane is left to take the slack. That last one is why this cannot be CSS alone:
 * with Layers switched off, Design has to grow into its place rather than sit at
 * the width it was dragged to.
 *
 * Everything a user arranges is theirs and comes back next time, so each change
 * sends setPref and a prefs message restores the lot.
 */
const { w, errors, sent, post, check, expect } = require("../harness/ui.js");
const D = w.document;

const $ = (id) => D.getElementById(id);
const click = (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
const pop = () => D.querySelector("#pop-layer .pop");
const closePop = () => $("pop-layer").dispatchEvent(new w.MouseEvent("mousedown", { bubbles: true }));
const prefsSent = () => sent.filter((m) => m.type === "setPref");
const lastPref = () => prefsSent()[prefsSent().length - 1];

function drag(el, from, to, axis) {
  const ev = (type, at) => {
    const e = new w.MouseEvent(type, {
      bubbles: true, cancelable: true,
      clientX: axis === "x" ? at : 0, clientY: axis === "y" ? at : 0
    });
    e.pointerId = 1;
    el.dispatchEvent(e);
  };
  ev("pointerdown", from);
  ev("pointermove", to);
  ev("pointerup", to);
}
/* Both jsdom and Chrome normalise a zero basis to `0px` when reading it back. */
const grows = (el) => /^1 1 0(px)?$/.test(el.style.flex);
/* jsdom lays nothing out, so the pane is told how big it currently is. */
function fakeSize(el, w2, h2) {
  Object.defineProperty(el, "offsetWidth", { value: w2, configurable: true });
  Object.defineProperty(el, "offsetHeight", { value: h2, configurable: true });
}

const layers = $("layers-pane"), insp = $("inspector"), scale = $("scale-pane");
const main = $("main"), rowTop = $("row-top"), hs = $("hsplit"), vs = $("vsplit");

post({ type: "pages", pages: [{ id: "0:1", name: "Page 1" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: [],
  rows: [{ id: "2:1", name: "Card", type: "FRAME", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false }] });
check("render");

/* ---- what the panel opens as ---- */
console.log("default layout:", main.className, "| dividers:", hs.className, "/", vs.className);
expect("it opens two-up with Scale underneath", main.classList.contains("mixed"));
expect("all three panes are there",
  !!layers && !!insp && !!scale && scale.style.display !== "none");
expect("the divider between Layers and Design is vertical", hs.className === "psplit x");
expect("the one above Scale is horizontal", vs.className === "psplit y");
expect("Layers takes the slack", grows(layers));
expect("Design keeps the width it was given", insp.style.flex === "0 1 264px");
expect("Scale keeps the height it was given", scale.style.flex === "0 1 150px");
expect("the two-up row is a real box in this arrangement", rowTop.style.display === "");

/* ---- three columns ---- */
const openPanels = () => click($("btn-panels"));
openPanels();
let p = pop();
expect("the panels popover opens", !!p);
let segs = [...p.querySelectorAll(".seg-b")];
console.log("arrangements offered:", segs.map(b => b.title).join(" | "));
expect("all three arrangements are offered", segs.length === 3);
expect("the current one is marked", segs[2].classList.contains("on"));

sent.length = 0;
click(segs[0]);
console.log("cols:", main.className, "| dividers:", hs.className, "/", vs.className);
expect("three columns", main.classList.contains("cols"));
expect("both dividers are vertical now",
  hs.className === "psplit x" && vs.className === "psplit x");
expect("the arrangement was saved", !!lastPref() && lastPref().layout === "cols");
expect("the popover stayed open, so the panels below can be toggled too", !!pop());
expect("and the segmented control moved its highlight",
  [...pop().querySelectorAll(".seg-b")][0].classList.contains("on"));

/* ---- three rows ---- */
click([...pop().querySelectorAll(".seg-b")][1]);
console.log("rows:", main.className, "| dividers:", hs.className, "/", vs.className);
expect("three rows", main.classList.contains("rows"));
expect("both dividers are horizontal",
  hs.className === "psplit y" && vs.className === "psplit y");
expect("the two-up row is not a box in this arrangement", rowTop.style.display === "");
check("arrangements");

/* ---- switching panes off ---- */
let rows = () => [...pop().querySelectorAll(".mi")];
console.log("panels offered:", rows().map(r => r.querySelector(".t").textContent).join(" | "));
expect("one row per panel", rows().length === 3);
expect("all three are ticked", rows().every(r => r.querySelector(".tick").innerHTML !== ""));

sent.length = 0;
click(rows()[0]);                                   /* Layers off */
console.log("layers off ->", layers.style.display, "| hsplit:", hs.style.display,
  "| design flex:", insp.style.flex);
expect("the Layers pane is gone", layers.style.display === "none");
expect("the divider that had Layers on one side went with it", hs.style.display === "none");
expect("Design took the slack", grows(insp));
expect("the divider above Scale is still there", vs.style.display === "");
expect("it was saved", !!lastPref() && lastPref().panes.layers === false);
expect("and the tick came off", rows()[0].querySelector(".tick").innerHTML === "");

click(rows()[2]);                                   /* Scale off too */
console.log("scale off ->", scale.style.display, "| vsplit:", vs.style.display);
expect("the Scale pane is gone", scale.style.display === "none");
expect("so is the divider above it", vs.style.display === "none");
expect("Design is on its own and still takes everything", grows(insp));

/* the last one off leaves an empty window, which has to say so */
sent.length = 0;
click(rows()[1]);
console.log("everything off ->", main.className, "| notified:",
  JSON.stringify(sent.filter(m => m.type === "notify").map(m => m.message)));
expect("the empty state shows", main.classList.contains("empty"));
expect("and it is not silent about it",
  sent.some(m => m.type === "notify" && /switched off/.test(m.message)));
expect("the way back is offered in the window itself", !!$("no-panes-btn"));

click(rows()[1]);
click(rows()[0]);
click(rows()[2]);
expect("switching them back on restores the panes",
  !main.classList.contains("empty") && layers.style.display === "" &&
  insp.style.display === "" && scale.style.display === "");
closePop();
check("switching panes");

/* ---- the dividers still resize, on whichever axis they are ---- */
sent.length = 0;
$("btn-panels").click();
click([...pop().querySelectorAll(".seg-b")][2]);     /* back to two-up */
closePop();

fakeSize(insp, 264, 400);
sent.length = 0;
drag(hs, 500, 460, "x");                            /* 40px to the left */
console.log("dragged the vertical divider 40px left -> design flex:", insp.style.flex);
expect("dragging the divider left widens Design", insp.style.flex === "0 1 304px");
expect("the size was saved when the drag ended",
  !!lastPref() && lastPref().splits.mixed.insp === 304);

fakeSize(scale, 600, 150);
sent.length = 0;
drag(vs, 500, 430, "y");                            /* 70px up */
console.log("dragged the horizontal divider 70px up -> scale flex:", scale.style.flex);
expect("dragging the divider up makes Scale taller", scale.style.flex === "0 1 220px");
expect("that size was saved too",
  !!lastPref() && lastPref().splits.mixed.scale === 220);

/* a pane cannot be dragged away entirely */
fakeSize(insp, 304, 400);
drag(hs, 500, 900, "x");
console.log("dragged far past the edge -> design flex:", insp.style.flex);
expect("a pane keeps a grabbable minimum", insp.style.flex === "0 1 60px");

/* each arrangement remembers its own sizes: a width is not a height */
$("btn-panels").click();
click([...pop().querySelectorAll(".seg-b")][1]);     /* rows */
closePop();
console.log("rows again -> design flex:", insp.style.flex, "| scale flex:", scale.style.flex);
expect("the stacked arrangement kept its own sizes",
  insp.style.flex === "0 1 300px" && scale.style.flex === "0 1 150px");
check("dividers");

/* ---- what comes back next time ---- */
post({ type: "prefs", theme: "dark", layout: "cols",
  panes: { layers: true, design: false, scale: true },
  splits: { cols: { insp: 200, scale: 320 }, rows: { insp: 300, scale: 150 },
            mixed: { insp: 264, scale: 150 } },
  anchor: "tl" });
console.log("restored:", main.className, "| design:", insp.style.display,
  "| scale flex:", scale.style.flex);
expect("the saved arrangement comes back", main.classList.contains("cols"));
expect("so does the panel that was switched off", insp.style.display === "none");
expect("and the sizes that belong to that arrangement", scale.style.flex === "0 1 320px");
expect("Layers takes the slack again", grows(layers));
$("btn-panels").click();
expect("the menu agrees with what was restored",
  [...pop().querySelectorAll(".seg-b")][0].classList.contains("on") &&
  [...pop().querySelectorAll(".mi")][1].querySelector(".tick").innerHTML === "");
closePop();

/* a stored object from an older version knows nothing of Scale */
post({ type: "prefs", theme: "dark", layout: "mixed", panes: { layers: true, design: true } });
console.log("prefs with no word about Scale ->", scale.style.display);
expect("a pane nobody stored an opinion about stays as it was", scale.style.display === "");
check("saved arrangement");

console.log("\nERRORS:", errors.length ? errors : "(none)");
