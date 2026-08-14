/* Reproduces the layer tree from the user's screenshot. */
const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;

function row(id, name, type, depth, parentId, extra) {
  return Object.assign({ id, name, type, depth, parentId, visible: true, locked: false,
    hasChildren: false, expanded: false, inComponent: false }, extra || {});
}

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["body"], zoom:1, rows:[
  row("btn",  "Button",             "INSTANCE",  1, "root", { inComponent:true }),
  row("body", "Body Empty",         "COMPONENT", 1, "root", { inComponent:true, hasChildren:true, expanded:true }),
  row("f933", "Frame 2087328933",   "FRAME",     2, "body", { inComponent:true, hasChildren:true, expanded:true, autolayout:"VERTICAL" }),
  row("top",  "Top",                "FRAME",     3, "f933", { inComponent:true, hasChildren:true, expanded:true, autolayout:"VERTICAL" }),
  row("swap", "Swap-area",          "INSTANCE",  4, "top",  { inComponent:true }),
  row("f812", "Frame 2087329812",   "FRAME",     4, "top",  { inComponent:true, autolayout:"VERTICAL" }),
  row("sugg", "Suggestions",        "FRAME",     3, "f933", { inComponent:true, hasChildren:true, expanded:true, autolayout:"VERTICAL" }),
  row("f783", "Frame 2087329783",   "FRAME",     4, "sugg", { inComponent:true, autolayout:"HORIZONTAL" }),
  row("sug2", "Suggestions",        "INSTANCE",  4, "sugg", { inComponent:true, hasChildren:true, expanded:true }),
  row("f782", "Frame 2087329782",   "FRAME",     5, "sug2", { inComponent:true, autolayout:"GRID" }),
  row("more", "More Examples",      "FRAME",     3, "f933", { inComponent:true, autolayout:"VERTICAL" }),
  row("scrl", "Scrollbar",          "FRAME",     1, "root", { visible:false, autolayout:"VERTICAL" }),
  row("f896", "Frame 2087328896",   "FRAME",     1, "root", { inComponent:true, autolayout:"WRAP" })
]});
check("render");

const seen = new Map();
[...D.querySelectorAll(".lrow")].forEach(el => {
  const svg = el.querySelector(".tico").innerHTML;
  if (!seen.has(svg)) seen.set(svg, "icon" + seen.size);
});

console.log("row".padEnd(20), "purple", "subtree", "icon#");
[...D.querySelectorAll(".lrow")].forEach(el => {
  const name = el.querySelector(".nm").textContent;
  const svg = el.querySelector(".tico").innerHTML;
  console.log(
    name.padEnd(20),
    (el.classList.contains("comp") ? "  yes " : "  --  "),
    (el.classList.contains("sub") ? "  yes  " : "  --   "),
    (el.classList.contains("sel") ? "[SELECTED] " : "") + seen.get(svg)
  );
});

/* icon identity check: the four auto-layout directions must all differ */
const byName = {};
[...D.querySelectorAll(".lrow")].forEach(el => { byName[el.querySelector(".nm").textContent] = el.querySelector(".tico").innerHTML; });
const v = byName["Frame 2087328933"], hz = byName["Frame 2087329783"],
      g = byName["Frame 2087329782"], wr = byName["Frame 2087328896"],
      inst = byName["Swap-area"], comp = byName["Body Empty"];
console.log("\nvertical != horizontal:", v !== hz);
console.log("horizontal != grid:     ", hz !== g);
console.log("grid != wrap:           ", g !== wr);
console.log("instance keeps diamond: ", inst !== v && inst === byName["Suggestions"]);
console.log("component keeps rosette:", comp !== v && comp !== inst);
console.log("hidden Scrollbar dimmed:", [...D.querySelectorAll(".lrow")].find(e=>/Scrollbar/.test(e.textContent)).classList.contains("off"));

console.log("\nERRORS:", errors.length ? errors : "(none)");
