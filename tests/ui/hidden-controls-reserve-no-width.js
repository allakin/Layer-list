/* No control that is invisible at rest may reserve layout width. */
const { w, errors, post, check } = require("../harness/ui.js");
const D = w.document;
const vis = el => w.getComputedStyle(el).display !== "none";

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:[], zoom:1, rows:[
  { id:"plain",  name:"A perfectly ordinary layer name", type:"FRAME", depth:0, parentId:"0:1",
    visible:true,  locked:false, hasChildren:false, expanded:false, inComponent:false },
  { id:"hidden", name:"Hidden layer",  type:"FRAME", depth:0, parentId:"0:1",
    visible:false, locked:false, hasChildren:false, expanded:false, inComponent:false },
  { id:"locked", name:"Locked layer",  type:"FRAME", depth:0, parentId:"0:1",
    visible:true,  locked:true,  hasChildren:false, expanded:false, inComponent:false },
  { id:"masked", name:"Mask layer",    type:"RECTANGLE", depth:0, parentId:"0:1",
    visible:true,  locked:false, hasChildren:false, expanded:false, inComponent:false, mask:true }
]});
check("layers");

console.log("LAYER ROWS");
[...D.querySelectorAll(".lrow")].forEach(el => {
  const btns = [...el.querySelectorAll(".acts .ib")];
  const shown = btns.filter(vis);
  console.log("  " + el.querySelector(".nm").textContent.slice(0,32).padEnd(34),
    "buttons=" + btns.length,
    "visible=" + shown.length,
    "| reserves strip: " + (el.classList.contains("has-stick") ? "yes" : "no"),
    "| padding: " + w.getComputedStyle(el.querySelector(".acts")).paddingLeft);
});

/* paint rows */
post({ type:"props", count:1, inspected:1, ids:["x"], types:["RECTANGLE"], refs:{},
  props:{ id:"x",name:"Rect",type:"RECTANGLE",visible:true,locked:false,x:0,y:0,width:100,height:100,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0},
    constraints:{horizontal:"MIN",vertical:"MIN"}, inAutoLayout:false,
    layoutSizingHorizontal:null,layoutSizingVertical:null,layoutPositioning:null,
    opacity:1, blendMode:"PASS_THROUGH",
    fills:[{type:"SOLID",visible:true,opacity:1,blendMode:"NORMAL",color:"#FF8800",colorVar:null}],
    fillStyleId:"",
    strokes:[{type:"SOLID",visible:true,opacity:1,blendMode:"NORMAL",color:"#000000",colorVar:null}],
    strokeStyleId:"", strokeWeight:1, strokeAlign:"INSIDE", strokeCap:"NONE", strokeJoin:"MITER",
    dashPattern:"", strokeSides:{top:1,right:1,bottom:1,left:1},
    effects:[{type:"DROP_SHADOW",visible:true,radius:8,color:"#000000",alpha:.2,offsetX:0,offsetY:4,spread:0,blendMode:"NORMAL",behind:false,vars:null}],
    effectStyleId:"", exportSettings:[], boundVariables:{}, childCount:0 }});
check("paints");

console.log("\nPAINT / EFFECT ROWS");
[...D.querySelectorAll(".prow")].forEach((el, i) => {
  const btns = [...el.querySelectorAll(".tools .ib")];
  console.log("  row " + i,
    "buttons=" + btns.length,
    "visible at rest=" + btns.filter(vis).length,
    "| " + btns.map(b => (vis(b) ? "[" : "(") + b.title.split(":")[0] + (vis(b) ? "]" : ")")).join(" "));
});

console.log("\nno opacity-based hiding left:",
  !/opacity: 0;/.test(require("fs").readFileSync(require("path").join(__dirname, "..", "..", "plugin", "ui.html"),"utf8")));
console.log("\nERRORS:", errors.length ? errors : "(none)");
