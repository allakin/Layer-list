/* The value must not be squeezed by controls that are invisible at rest. */
const { w, errors, post, check } = require("../harness/ui.js");
const D = w.document;

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["a"], zoom:1,
  rows:[{id:"a",name:"Row",type:"FRAME",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:false,inComponent:false}]});
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:{},
  props:{ id:"a",name:"Row",type:"FRAME",visible:true,locked:false,x:0,y:0,width:433,height:52,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0}, cornerSmoothing:0,
    constraints:{horizontal:"MIN",vertical:"MIN"}, layoutMode:"NONE",
    clipsContent:false, layoutSizingHorizontal:"FIXED", layoutSizingVertical:"FIXED", layoutPositioning:"AUTO",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null, inAutoLayout:false,
    opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
    strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", layoutGrids:[], gridStyleId:"", exportSettings:[],
    boundVariables:{}, childCount:2 }});
check("render");

function report(key) {
  const fld = D.querySelector('[data-key="' + key + '"]');
  const tailBtns = [...fld.querySelectorAll(".tail .ib")];
  const hidden = tailBtns.filter(b => w.getComputedStyle(b).display === "none").length;
  const stick  = tailBtns.filter(b => b.classList.contains("stick")).length;
  console.log(key.padEnd(8),
    "value=" + JSON.stringify(fld.querySelector("input").value),
    "| tail buttons=" + tailBtns.length,
    "| hidden at rest=" + hidden,
    "| always shown=" + stick,
    "| icon col=" + w.getComputedStyle(fld.querySelector(".k")).width);
}
["w","h","x","y","opacity","radius"].forEach(report);

/* Fill/Hug labels must still reserve their space */
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:{},
  props:{ id:"a",name:"Row",type:"FRAME",visible:true,locked:false,x:0,y:0,width:433,height:52,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0},
    constraints:{horizontal:"MIN",vertical:"MIN"}, layoutMode:"VERTICAL",
    layout:{mode:"VERTICAL",itemSpacing:8,counterAxisSpacing:null,paddingTop:0,paddingRight:0,paddingBottom:0,paddingLeft:0,
      primaryAxisAlignItems:"MIN",counterAxisAlignItems:"MIN",counterAxisAlignContent:"AUTO",
      layoutWrap:"NO_WRAP",itemReverseZIndex:false,strokesIncludedInLayout:false},
    clipsContent:true, layoutSizingHorizontal:"FILL", layoutSizingVertical:"HUG", layoutPositioning:"AUTO",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null, inAutoLayout:true,
    opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
    strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", layoutGrids:[], gridStyleId:"", exportSettings:[],
    boundVariables:{}, childCount:2 }});
check("sizing modes");
console.log("");
["w","h"].forEach(k => {
  const fld = D.querySelector('[data-key="' + k + '"]');
  const shown = [...fld.querySelectorAll(".tail .ib")]
    .filter(b => w.getComputedStyle(b).display !== "none")
    .map(b => b.textContent.trim() || b.title);
  console.log(k, "value=" + JSON.stringify(fld.querySelector("input").value), "| visible tail:", shown.join(", ") || "(none)");
});

console.log("\nERRORS:", errors.length ? errors : "(none)");
