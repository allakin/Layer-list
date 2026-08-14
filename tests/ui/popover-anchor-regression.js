/* Regression: "Apply variable…" from the Gap chevron menu used to crash, because
   the handler read e.currentTarget after the event had finished dispatching. */
const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function ev(el,type,init){ if(!el){errors.push("no el for "+type);return;} el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["a"], zoom:1,
  rows:[{id:"a",name:"Row",type:"FRAME",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:false,autolayout:"HORIZONTAL",inComponent:false}]});
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:{},
  props:{ id:"a",name:"Row",type:"FRAME",visible:true,locked:false,x:0,y:0,width:480,height:40,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0}, cornerSmoothing:0,
    constraints:{horizontal:"MIN",vertical:"MIN"}, layoutMode:"HORIZONTAL",
    layout:{mode:"HORIZONTAL",itemSpacing:8,counterAxisSpacing:null,paddingTop:0,paddingRight:0,paddingBottom:0,paddingLeft:0,
      primaryAxisAlignItems:"MIN",counterAxisAlignItems:"CENTER",counterAxisAlignContent:"AUTO",
      layoutWrap:"NO_WRAP",itemReverseZIndex:false,strokesIncludedInLayout:false},
    clipsContent:false, layoutSizingHorizontal:"FIXED", layoutSizingVertical:"HUG", layoutPositioning:"AUTO",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null, inAutoLayout:false,
    opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
    strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", layoutGrids:[], gridStyleId:"", exportSettings:[],
    boundVariables:{}, childCount:3 }});
post({ type:"variables", collections:[
  { id:"C:1", name:"Core", remote:false, defaultModeId:"M:1", modes:[{id:"M:1",name:"Value"}],
    variables:[{ id:"V:1", key:"k1", name:"space/md", group:"space", short:"md", type:"FLOAT",
      byMode:{ "M:1":{alias:false,aliasName:null,color:null,alpha:1,text:"16"} } }] }] });
post({ type:"libraryVariables", collections:[] });
check("render");

/* the gap chevron */
const chevron = D.querySelector('[data-key="gap"] .tail .ib');
console.log("gap chevron present:", !!chevron);
ev(chevron, "click");
console.log("spacing menu:", [...D.querySelectorAll("#pop-layer .mi .t")].map(e=>e.textContent).join(" / "));

/* the item that used to blow up */
const applyItem = [...D.querySelectorAll("#pop-layer .mi")].find(m=>/Apply variable/.test(m.textContent));
ev(applyItem, "click");
check("apply variable from gap menu");
console.log("token picker opened:", !!D.querySelector("#pop-layer .tok-list"));
console.log("tokens listed:", [...D.querySelectorAll("#pop-layer .tok-row .nm")].map(e=>e.textContent).join(", "));
sent.length=0;
ev(D.querySelector("#pop-layer .tok-row"), "click");
console.log("bind ->", JSON.stringify(sent.find(m=>m.type==="bindVariable")));

/* the other two items still work */
ev(D.querySelector('[data-key="gap"] .tail .ib'), "click");
sent.length=0;
ev([...D.querySelectorAll("#pop-layer .mi")].find(m=>/Space between/.test(m.textContent)), "click");
console.log("space between ->", JSON.stringify(sent.find(m=>m.key==="primaryAxisAlignItems")));

/* same journey from the W field menu */
ev(D.querySelector('[data-key="w"] .tail .ib'), "click");
ev([...D.querySelectorAll("#pop-layer .mi")].find(m=>/Apply variable/.test(m.textContent)), "click");
check("apply variable from W menu");
console.log("W token picker opened:", !!D.querySelector("#pop-layer .tok-list"));

/* and a popover with no anchor at all must not take the panel down */
w.eval("popOpen(null, document.createElement('div'), { width: 120 })");
check("null anchor");
console.log("null-anchor popover survived:", !!D.querySelector("#pop-layer .pop"));

console.log("\nERRORS:", errors.length ? errors : "(none)");
