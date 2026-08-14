/* Stroke section: Position / Weight pair, and Start / End point per node kind. */
const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function ev(el,type,init){ if(!el){errors.push("no el for "+type);return;} el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }

function shape(type, extra) {
  return Object.assign({
    id:"s", name:"Shape", type:type, visible:true, locked:false, x:0, y:0, width:58, height:0, rotation:0,
    constraints:{horizontal:"MIN",vertical:"MIN"}, inAutoLayout:false,
    layoutSizingHorizontal:null, layoutSizingVertical:null, layoutPositioning:null,
    opacity:1, blendMode:"PASS_THROUGH",
    fills:[], fillStyleId:"",
    strokes:[{type:"SOLID",visible:true,opacity:1,blendMode:"NORMAL",color:"#000000",colorVar:null}],
    strokeStyleId:"", strokeWeight:2, strokeAlign:"CENTER", strokeCap:"NONE", strokeJoin:"MITER",
    strokeMiterLimit:4, dashPattern:"", strokeSides:{top:2,right:2,bottom:2,left:2},
    effects:[], effectStyleId:"", exportSettings:[], boundVariables:{}, childCount:0
  }, extra);
}
function render(props) {
  post({ type:"props", count:1, inspected:1, ids:["s"], types:[props.type], refs:{}, props:props });
  const sec = [...D.querySelectorAll(".sec")].find(s=>{const t=s.querySelector(".sec-hd .t");return t&&t.textContent==="Stroke";});
  return sec;
}
post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["s"], zoom:1,
  rows:[{id:"s",name:"Line",type:"LINE",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:false,expanded:false,inComponent:false}]});

/* 1. VECTOR with per-vertex caps */
let sec = render(shape("VECTOR", { capMode:"vector", strokeCapStart:"NONE", strokeCapEnd:"ARROW_LINES" }));
check("vector");
console.log("labels:", [...sec.querySelectorAll(".lbl")].map(e=>e.textContent).join(" | "));
console.log("dropdowns:", [...sec.querySelectorAll(".sel .v")].map(e=>e.textContent).join(" | "));
const caps = [...sec.querySelectorAll(".sel")].slice(1);
ev(caps[0], "click");
console.log("menu:", [...D.querySelectorAll("#pop-layer .mi .t")].map(e=>e.textContent).join(", "));
console.log("menu icons:", D.querySelectorAll("#pop-layer .mi-icon").length, "of", D.querySelectorAll("#pop-layer .mi").length);
sent.length=0;
ev([...D.querySelectorAll("#pop-layer .mi")].find(m=>/Diamond arrow/.test(m.textContent)), "click");
console.log("set start ->", JSON.stringify(sent.find(m=>m.key==="strokeCapStart")));
sent.length=0;
ev(caps[1], "click");
ev([...D.querySelectorAll("#pop-layer .mi")].find(m=>/Circle arrow/.test(m.textContent)), "click");
console.log("set end   ->", JSON.stringify(sent.find(m=>m.key==="strokeCapEnd")));
check("vector caps");

/* 2. CONNECTOR */
sec = render(shape("CONNECTOR", { capMode:"connector", strokeCapStart:"NONE", strokeCapEnd:"ARROW_EQUILATERAL" }));
console.log("\nconnector dropdowns:", [...sec.querySelectorAll(".sel .v")].map(e=>e.textContent).join(" | "));

/* 3. plain LINE — one shared cap, stated plainly */
sec = render(shape("LINE", { capMode:"shared", strokeCapStart:"ROUND", strokeCapEnd:"ROUND" }));
console.log("\nline dropdowns:", [...sec.querySelectorAll(".sel .v")].map(e=>e.textContent).join(" | "));
console.log("line hint:", (sec.querySelector(".hint")||{textContent:"(none)"}).textContent.slice(0,60) + "…");

/* 4. a closed shape has no endpoints at all */
sec = render(shape("RECTANGLE", { width:100, height:100 }));
console.log("\nrectangle labels:", [...sec.querySelectorAll(".lbl")].map(e=>e.textContent).join(" | "), "(no Start/End)");

/* 5. advanced popover */
ev(sec.querySelector('.ib[title^="Advanced stroke"]'), "click");
console.log("advanced groups:", [...D.querySelectorAll("#pop-layer .mgroup")].map(e=>e.textContent).join(" | "));
console.log("per-side fields:", D.querySelectorAll("#pop-layer .fld").length, "| join buttons:", D.querySelectorAll("#pop-layer .seg-b").length);
check("advanced");

console.log("\nERRORS:", errors.length ? errors : "(none)");
