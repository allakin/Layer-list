/* Auto layout block, against the user's screenshot. */
const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function ev(el,type,init){ if(!el){errors.push("no el for "+type);return;} el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["a"], zoom:1,
  rows:[{id:"a",name:"Frame",type:"FRAME",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:false,autolayout:"VERTICAL",inComponent:false}]});
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:{},
  props:{ id:"a",name:"Frame",type:"FRAME",visible:true,locked:false,x:0,y:0,width:480,height:186,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0}, cornerSmoothing:0,
    constraints:{horizontal:"MIN",vertical:"MIN"},
    layoutMode:"VERTICAL",
    layout:{mode:"VERTICAL",itemSpacing:0,counterAxisSpacing:null,paddingTop:0,paddingRight:0,paddingBottom:0,paddingLeft:0,
      primaryAxisAlignItems:"CENTER",counterAxisAlignItems:"CENTER",counterAxisAlignContent:"AUTO",
      layoutWrap:"NO_WRAP",itemReverseZIndex:false,strokesIncludedInLayout:false},
    clipsContent:false, layoutSizingHorizontal:"FIXED", layoutSizingVertical:"HUG", layoutPositioning:"AUTO",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null, inAutoLayout:false,
    opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
    strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", layoutGrids:[], gridStyleId:"", exportSettings:[],
    boundVariables:{}, childCount:3 }});
check("render");

const sec = [...D.querySelectorAll(".sec")].find(s=>{const t=s.querySelector(".sec-hd .t");return t&&/Auto layout|Layout/.test(t.textContent);});
console.log("TITLE:", sec.querySelector(".sec-hd .t").textContent,
            "| header icons:", [...sec.querySelectorAll(".sec-hd .acts .ib")].length);
console.log("labels:", [...sec.querySelectorAll(".lbl")].map(e=>e.textContent).join(" | "));
console.log("flow buttons:", sec.querySelectorAll(".grp .seg-b").length,
            "| active:", [...sec.querySelectorAll(".seg-b.on")].map(b=>b.title).join(","));
console.log("W tail:", [...D.querySelectorAll('[data-key="w"] .tail .ib')].map(b=>b.textContent.trim() || "chevron").join(","),
            "| H tail:", [...D.querySelectorAll('[data-key="h"] .tail .ib')].map(b=>b.textContent.trim() || "chevron").join(","));
console.log("align pad cells:", sec.querySelectorAll(".padgrid .c").length,
            "| on:", sec.querySelectorAll(".padgrid .c.on").length);
console.log("padding fields:", [...sec.querySelectorAll('[data-key="padV"], [data-key="padH"]')].length);
console.log("clip content:", !!sec.querySelector(".chk"));

/* flow: switching to none removes auto layout */
sent.length=0;
ev([...sec.querySelectorAll(".seg-b")].find(b=>b.title==="No auto layout"), "click");
console.log("\nflow none ->", JSON.stringify(sent.find(m=>m.key==="layoutMode")));

/* the H field menu */
ev(D.querySelector('[data-key="h"] .tail .ib'), "click");
console.log("H menu:", [...D.querySelectorAll("#pop-layer .mi .t")].map(e=>e.textContent).join(" / "));
console.log("ticked:", [...D.querySelectorAll("#pop-layer .mi")].filter(m=>m.querySelector(".tick").innerHTML).map(m=>m.querySelector(".t").textContent).join(","));
const items = [...D.querySelectorAll("#pop-layer .mi")];
const fillItem = items.find(m=>/Fill container/.test(m.textContent));
console.log("Fill container listed:", !!fillItem, "| greyed out here:", fillItem.classList.contains("dis"));
sent.length=0;
ev(items.find(m=>/Fixed height/.test(m.textContent)), "click");
console.log("pick Fixed ->", JSON.stringify(sent.find(m=>m.key==="layoutSizingVertical")));

/* Apply variable from that menu */
ev(D.querySelector('[data-key="h"] .tail .ib'), "click");
sent.length=0;
ev([...D.querySelectorAll("#pop-layer .mi")].find(m=>/Apply variable/.test(m.textContent)), "click");
console.log("apply variable opens picker:", !!D.querySelector("#pop-layer .tok-list"),
            "| requested:", [...new Set(sent.map(m=>m.type))].join(","));
check("sizing menu");

/* wrap moved into the advanced popover for horizontal flow */
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:{},
  props:{ id:"a",name:"Frame",type:"FRAME",visible:true,locked:false,x:0,y:0,width:480,height:186,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0},
    constraints:{horizontal:"MIN",vertical:"MIN"}, layoutMode:"HORIZONTAL",
    layout:{mode:"HORIZONTAL",itemSpacing:8,counterAxisSpacing:4,paddingTop:0,paddingRight:0,paddingBottom:0,paddingLeft:0,
      primaryAxisAlignItems:"MIN",counterAxisAlignItems:"MIN",counterAxisAlignContent:"AUTO",
      layoutWrap:"WRAP",itemReverseZIndex:false,strokesIncludedInLayout:false},
    clipsContent:false, layoutSizingHorizontal:"FIXED", layoutSizingVertical:"HUG", layoutPositioning:"AUTO",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null, inAutoLayout:false,
    opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
    strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", layoutGrids:[], gridStyleId:"", exportSettings:[],
    boundVariables:{}, childCount:3 }});
const sec2 = [...D.querySelectorAll(".sec")].find(s=>{const t=s.querySelector(".sec-hd .t");return t&&t.textContent==="Auto layout";});
ev(sec2.querySelector('.ib[title^="Advanced layout"]'), "click");
console.log("\nadvanced groups:", [...D.querySelectorAll("#pop-layer .mgroup")].map(e=>e.textContent).join(" | "));
check("advanced");

console.log("\nERRORS:", errors.length ? errors : "(none)");
