/* Padding stacks; and the inspector must shrink with the window rather than be
   pushed off the right edge. */
const { w, errors, post, check } = require("../harness/ui.js");
const D = w.document;
const css = el => w.getComputedStyle(el);

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["a"], zoom:1,
  rows:[{id:"a",name:"Frame",type:"FRAME",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:false,autolayout:"VERTICAL",inComponent:false}]});
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:{},
  props:{ id:"a",name:"Frame",type:"FRAME",visible:true,locked:false,x:0,y:0,width:480,height:186,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0}, cornerSmoothing:0,
    constraints:{horizontal:"MIN",vertical:"MIN"}, layoutMode:"VERTICAL",
    layout:{mode:"VERTICAL",itemSpacing:0,counterAxisSpacing:null,paddingTop:28,paddingRight:32,paddingBottom:28,paddingLeft:32,
      primaryAxisAlignItems:"CENTER",counterAxisAlignItems:"CENTER",counterAxisAlignContent:"AUTO",
      layoutWrap:"NO_WRAP",itemReverseZIndex:false,strokesIncludedInLayout:false},
    clipsContent:false, layoutSizingHorizontal:"FIXED", layoutSizingVertical:"HUG", layoutPositioning:"AUTO",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null, inAutoLayout:false,
    opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
    strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", layoutGrids:[], gridStyleId:"", exportSettings:[],
    boundVariables:{}, childCount:3 }});
check("render");

const padV = D.querySelector('[data-key="padV"]');
const padH = D.querySelector('[data-key="padH"]');
const stack = padV.parentElement;
console.log("padding values:      ", padV.querySelector("input").value, "/", padH.querySelector("input").value);
console.log("share a parent:      ", stack === padH.parentElement);
console.log("stack direction:     ", css(stack).flexDirection, "(want: column)");
console.log("per-side button kept:",
  !!stack.parentElement.querySelector('.ib[title="Padding per side"]'));

/* the inspector must be allowed to shrink */
const insp = D.getElementById("inspector");
const flex = css(insp);
console.log("\ninspector flex-grow / shrink / basis:",
  flex.flexGrow + " / " + flex.flexShrink + " / " + flex.flexBasis);
console.log("shrinkable:          ", flex.flexShrink !== "0", "(was 0 — the panel ran off the window)");
console.log("min-width:           ", flex.minWidth);

/* the splitter keeps it shrinkable */
const split = D.getElementById("hsplit");
["setPointerCapture","releasePointerCapture"].forEach(m => { split[m] = function(){}; });
const down = new w.MouseEvent("pointerdown",{bubbles:true,cancelable:true,clientX:300}); down.pointerId=1;
split.dispatchEvent(down);
const move = new w.MouseEvent("pointermove",{bubbles:true,clientX:380}); move.pointerId=1;
split.dispatchEvent(move);
console.log("after splitter drag: ", insp.style.flex);
check("splitter");

console.log("\nERRORS:", errors.length ? errors : "(none)");
