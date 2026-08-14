/* Slots: own colour, own icon, expandable, and a valid drop target.
   Narrow mode: paired controls stack instead of scrolling out of view. */
const { w, errors, post, check } = require("../harness/ui.js");
const D = w.document;
const css = el => w.getComputedStyle(el);

function row(id, name, type, depth, parentId, extra) {
  return Object.assign({ id, name, type, depth, parentId, visible:true, locked:false,
    hasChildren:false, expanded:false, inComponent:false }, extra || {});
}

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["content"], zoom:1.25, rows:[
  row("dialog",  "Dialog",            "INSTANCE", 0, "0:1", { inComponent:true, hasChildren:true, expanded:true }),
  row("bg",      ".Background",       "INSTANCE", 1, "dialog", { inComponent:true }),
  row("top",     "Top",               "FRAME",    1, "dialog", { inComponent:true, autolayout:"HORIZONTAL", hasChildren:true }),
  row("content", "Content",           "SLOT",     1, "dialog", { inComponent:true, hasChildren:true, expanded:true }),
  row("f104",    "Frame 2087326104",  "FRAME",    2, "content", { autolayout:"HORIZONTAL" }),
  row("bottom",  "Dialog Bottom",     "FRAME",    1, "dialog", { inComponent:true, autolayout:"HORIZONTAL", hasChildren:true })
]});
check("layers");

console.log("row".padEnd(20), "class", "".padEnd(18), "caret");
[...D.querySelectorAll(".lrow")].forEach(el => {
  const name = el.querySelector(".nm").textContent;
  const cls = [...el.classList].filter(c => c !== "lrow").join(" ") || "-";
  const caret = el.querySelector(".caret");
  console.log("  " + name.padEnd(20), cls.padEnd(22),
    caret && !caret.classList.contains("none") ? "yes" : "no");
});

const slotRow = [...D.querySelectorAll(".lrow")].find(e=>/Content/.test(e.textContent));
const compRow = [...D.querySelectorAll(".lrow")].find(e=>/Dialog Bottom/.test(e.textContent));
console.log("\nslot name colour:      ", css(slotRow.querySelector(".nm")).color);
console.log("component name colour: ", css(compRow.querySelector(".nm")).color);
console.log("slot overrides comp:   ", slotRow.classList.contains("comp") && slotRow.classList.contains("slot"));
console.log("slot icon differs:     ",
  slotRow.querySelector(".tico").innerHTML !== compRow.querySelector(".tico").innerHTML);
console.log("slot is a drop target: ", w.eval("CAN_CONTAIN.SLOT === 1"));

/* narrow mode */
post({ type:"props", count:1, inspected:1, ids:["content"], types:["SLOT"], refs:{},
  props:{ id:"content",name:"Content",type:"SLOT",visible:true,locked:false,x:0,y:56,width:720,height:518,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0}, cornerSmoothing:0,
    constraints:{horizontal:"MIN",vertical:"MIN"}, layoutMode:"VERTICAL",
    layout:{mode:"VERTICAL",itemSpacing:4,counterAxisSpacing:null,paddingTop:10,paddingRight:32,paddingBottom:10,paddingLeft:32,
      primaryAxisAlignItems:"MIN",counterAxisAlignItems:"MIN",counterAxisAlignContent:"AUTO",
      layoutWrap:"NO_WRAP",itemReverseZIndex:false,strokesIncludedInLayout:false},
    clipsContent:false, layoutSizingHorizontal:"FILL", layoutSizingVertical:"HUG", layoutPositioning:"AUTO",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null, inAutoLayout:true,
    opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
    strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", layoutGrids:[], gridStyleId:"", exportSettings:[],
    boundVariables:{}, childCount:2 }});
check("slot props");
console.log("\nheader glyph colour:   ", css(D.querySelector("#insp-body .sec .r span")).color);

const insp = D.getElementById("inspector");
function pairDir() {
  const p = D.querySelector("#insp-body .pair");
  return p ? css(p).flexDirection : "(no pair)";
}
Object.defineProperty(insp, "clientWidth", { value: 264, configurable: true });
w.eval("syncNarrow()");
console.log("at 264px  narrow:", insp.classList.contains("narrow"), "| pair direction:", pairDir(),
  "| section min-width:", css(D.querySelector("#insp-body .sec")).minWidth);
Object.defineProperty(insp, "clientWidth", { value: 200, configurable: true });
w.eval("syncNarrow()");
console.log("at 200px  narrow:", insp.classList.contains("narrow"), "| pair direction:", pairDir(),
  "| section min-width:", css(D.querySelector("#insp-body .sec")).minWidth);
check("narrow mode");

console.log("\nERRORS:", errors.length ? errors : "(none)");
