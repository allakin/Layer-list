const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
const M = "__MIXED__";
function ev(el,type,init){ el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }
function pev(el,type,init){ const e=new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init)); e.pointerId=1; el.dispatchEvent(e); }

// jsdom lacks pointer capture
w.Element.prototype.setPointerCapture = function(){};
w.Element.prototype.releasePointerCapture = function(){};

post({ type:"pages", pages:[{id:"0:1",name:"Page 1"}], currentPageId:"0:1" });
const rows = [
  {id:"a",name:"Frame A",type:"FRAME",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:true},
  {id:"b",name:"Text B",type:"TEXT",depth:1,parentId:"a",visible:true,locked:false,hasChildren:false,expanded:false},
  {id:"c",name:"Rect C",type:"RECTANGLE",depth:1,parentId:"a",visible:true,locked:false,hasChildren:false,expanded:false},
  {id:"d",name:"Group D",type:"GROUP",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:false}
];
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["b"], rows });

/* ---- click / cmd-click / shift-click ---- */
const el = id => D.querySelector('.lrow[data-id="'+id+'"]');
sent.length=0;
pev(el("c"),"pointerdown",{button:0});
console.log("plain click ->", JSON.stringify(sent.find(m=>m.type==="select")));
sent.length=0;
pev(el("d"),"pointerdown",{button:0,metaKey:true});
console.log("cmd click   ->", JSON.stringify(sent.find(m=>m.type==="select")));
sent.length=0;
pev(el("a"),"pointerdown",{button:0,shiftKey:true});
console.log("shift click ->", JSON.stringify(sent.find(m=>m.type==="select")));
check("selection");

/* ---- caret toggle ---- */
sent.length=0;
ev(el("d").querySelector(".caret"),"click");
console.log("caret ->", JSON.stringify(sent.find(m=>m.type==="setExpanded")));

/* ---- eye / lock ---- */
sent.length=0;
ev(el("b").querySelectorAll(".acts .ib")[0],"click");
console.log("eye ->", JSON.stringify(sent.find(m=>m.type==="action")));

/* ---- rename via double click ---- */
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["b"], rows });
ev(el("b"),"dblclick");
const rn = D.querySelector(".lrow .rn");
console.log("rename input:", !!rn, JSON.stringify(rn && rn.value));
sent.length=0;
if (rn) { rn.value = "Renamed"; rn.dispatchEvent(new w.KeyboardEvent("keydown",{key:"Enter",bubbles:true})); }
console.log("rename ->", JSON.stringify(sent.find(m=>m.type==="rename")));
check("rename");

/* ---- context menu ---- */
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["b"], rows });
ev(el("b"),"contextmenu",{clientX:40,clientY:60});
console.log("context menu items:", D.querySelectorAll("#pop-layer .mi").length);
const del = [...D.querySelectorAll("#pop-layer .mi")].find(m=>/Delete/.test(m.textContent));
sent.length=0; ev(del,"click");
console.log("delete ->", JSON.stringify(sent.find(m=>m.type==="action")));
check("context menu");

/* ---- keyboard nav ---- */
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["a"], rows });
sent.length=0;
D.getElementById("tree").dispatchEvent(new w.KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}));
console.log("arrow down ->", JSON.stringify(sent.find(m=>m.type==="select")));
sent.length=0;
D.getElementById("tree").dispatchEvent(new w.KeyboardEvent("keydown",{key:"g",metaKey:true,bubbles:true}));
console.log("cmd+G ->", JSON.stringify(sent.find(m=>m.type==="action")));
check("keyboard");

/* ---- search ---- */
const s = D.getElementById("search");
s.value = "rect"; s.dispatchEvent(new w.Event("input",{bubbles:true}));
post({ type:"layers", pageName:"P", truncated:false, searching:true, selection:[],
  rows:[{id:"c",name:"Rect C",type:"RECTANGLE",depth:0,parentId:"a",visible:true,locked:false,hasChildren:false,expanded:false,path:"Frame A"}]});
console.log("search rows:", D.querySelectorAll(".lrow").length, "| path shown:", !!D.querySelector(".lrow .path"));
check("search");

/* ---- multi-select props with MIXED ---- */
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["b","c"], rows });
post({ type:"props", count:2, inspected:2, ids:["b","c"], types:["TEXT","RECTANGLE"], refs:{},
  colors:[{hex:"#FF0000",count:2},{hex:"#00FF00",count:1}],
  props:{ id:"b", name:M, type:M, visible:true, locked:false,
    x:M, y:10, width:M, height:M, rotation:0, opacity:M, blendMode:"NORMAL",
    constraints:{horizontal:"MIN",vertical:"MIN"}, inAutoLayout:false,
    layoutSizingHorizontal:null, layoutSizingVertical:null, layoutPositioning:null,
    fills:M, fillStyleId:M, strokes:[], strokeStyleId:"", strokeWeight:M, strokeAlign:"CENTER",
    dashPattern:"", strokeSides:{top:null}, effects:M, effectStyleId:"",
    exportSettings:[], boundVariables:{}, childCount:0 }});
check("mixed props");
const mix = [...D.querySelectorAll("#insp-body input")].filter(i=>i.placeholder==="Mixed").length;
console.log("mixed placeholders:", mix, "| 'Mixed content' blocks:", [...D.querySelectorAll(".empty-line")].filter(e=>/Mixed/.test(e.textContent)).length);
console.log("selection colours swatches:", D.querySelectorAll(".sec .swatches .sw").length);
console.log("badge:", D.getElementById("sel-badge").textContent);

/* ---- empty selection ---- */
post({ type:"props", props:null, count:0 });
console.log("empty state:", !!D.getElementById("insp-empty"));

console.log("\nERRORS:", errors.length ? errors : "(none)");
