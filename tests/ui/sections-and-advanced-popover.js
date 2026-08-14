const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function ev(el,type,init){ if(!el){errors.push("no el for "+type);return;} el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["a"], zoom:1.1,
  rows:[{id:"a",name:"Row",type:"FRAME",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:false}]});
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:{},
  props:{ id:"a",name:"Row",type:"FRAME",visible:true,locked:false,x:12,y:8,width:1164,height:36,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0}, cornerSmoothing:0,
    constraints:{horizontal:"STRETCH",vertical:"MIN"},
    layoutMode:"HORIZONTAL",
    layout:{mode:"HORIZONTAL",itemSpacing:0,counterAxisSpacing:null,paddingTop:0,paddingRight:0,paddingBottom:0,paddingLeft:0,
      primaryAxisAlignItems:"MIN",counterAxisAlignItems:"CENTER",counterAxisAlignContent:"AUTO",
      layoutWrap:"NO_WRAP",itemReverseZIndex:false,strokesIncludedInLayout:false},
    clipsContent:false, layoutSizingHorizontal:"FIXED", layoutSizingVertical:"FIXED", layoutPositioning:"AUTO",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null, inAutoLayout:false,
    opacity:1, blendMode:"PASS_THROUGH",
    fills:[], fillStyleId:"", strokes:[], strokeStyleId:"", strokeWeight:0, strokeAlign:"INSIDE",
    dashPattern:"", strokeSides:{top:null}, effects:[], effectStyleId:"", layoutGrids:[], gridStyleId:"",
    exportSettings:[], boundVariables:{}, childCount:3 }});
check("frame render");

console.log("SECTIONS: " + [...D.querySelectorAll("#insp-body .sec .sec-hd .t")].map(e=>e.textContent).join(" | "));
const posSec = [...D.querySelectorAll(".sec")].find(s=>{const t=s.querySelector(".sec-hd .t");return t&&t.textContent==="Position";});
console.log("Position groups: " + [...posSec.querySelectorAll(".grp > .lbl")].map(e=>e.textContent).join(" / "));
console.log("Position header icons: " + [...posSec.querySelectorAll(".sec-hd .acts .ib")].length + "  (single selection)");
const laySec = [...D.querySelectorAll(".sec")].find(s=>{const t=s.querySelector(".sec-hd .t");return t&&/^(Auto layout|Layout)$/.test(t.textContent);});
console.log("Layout inline checkboxes: " + [...laySec.querySelectorAll(".chk")].map(e=>e.textContent).join(", "));

ev(laySec.querySelector('.ib[title^="Advanced layout"]'), "click");
console.log("Advanced popover: " + [...D.querySelectorAll("#pop-layer .mgroup")].map(e=>e.textContent).join(" | ") +
            "  | checkbox: " + [...D.querySelectorAll("#pop-layer .chk")].map(e=>e.textContent).join(", ") +
            "  | stacking btns: " + D.querySelectorAll("#pop-layer .seg-b").length);
const stack = [...D.querySelectorAll("#pop-layer .seg-b")].find(b=>/First on top/.test(b.textContent));
sent.length=0; ev(stack,"click");
console.log("stacking ->", JSON.stringify(sent.find(m=>m.key==="itemReverseZIndex")));
check("advanced popover");

/* multi-selection brings the distribute control back */
D.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown",{bubbles:true}));
post({ type:"props", count:3, inspected:3, ids:["a","b","c"], types:["FRAME"], refs:{}, colors:[],
  props:{ id:"a",name:"__MIXED__",type:"FRAME",visible:true,locked:false,x:"__MIXED__",y:8,
    width:"__MIXED__",height:36,rotation:0, constraints:{horizontal:"MIN",vertical:"MIN"}, inAutoLayout:false,
    layoutSizingHorizontal:null,layoutSizingVertical:null,layoutPositioning:null,
    opacity:1,blendMode:"PASS_THROUGH",fills:[],fillStyleId:"",strokes:[],strokeStyleId:"",
    strokeWeight:0,strokeAlign:"INSIDE",dashPattern:"",strokeSides:{top:null},
    effects:[],effectStyleId:"",exportSettings:[],boundVariables:{},childCount:0 }});
const posSec2 = [...D.querySelectorAll(".sec")].find(s=>{const t=s.querySelector(".sec-hd .t");return t&&t.textContent==="Position";});
console.log("Position header icons (3 selected): " + [...posSec2.querySelectorAll(".sec-hd .acts .ib")].map(b=>b.title).join(", "));
console.log("disabled field look: " + (function(){
  const f=D.querySelector('[data-key="x"]'); return f.classList.contains("dis") ? "hairline (dis)" : "plate";
})());
check("multi");

console.log("\nERRORS:", errors.length ? errors : "(none)");
