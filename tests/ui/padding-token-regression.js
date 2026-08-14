/* Regression: a token-bound padding on a frame with uneven padding used to
   crash the panel ("Cannot set properties of null (setting 'placeholder')"). */
const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;

function frame(layout, bound, extra) {
  return Object.assign({
    id:"a", name:"Row", type:"FRAME", visible:true, locked:false, x:0, y:0, width:1164, height:36, rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0}, cornerSmoothing:0,
    constraints:{horizontal:"MIN",vertical:"MIN"}, layoutMode:"HORIZONTAL", layout:layout,
    clipsContent:false, layoutSizingHorizontal:"FIXED", layoutSizingVertical:"HUG", layoutPositioning:"AUTO",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null, inAutoLayout:false,
    opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
    strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", layoutGrids:[], gridStyleId:"", exportSettings:[],
    boundVariables: bound, childCount:3
  }, extra || {});
}
const REFS = {
  "VariableID:g4": { kind:"variable", name:"g-spacing-4", short:"g-spacing-4", type:"FLOAT", collection:"Grid", remote:true, modes:[] },
  "VariableID:r2": { kind:"variable", name:"radius/2", short:"2", type:"FLOAT", collection:"Grid", remote:true, modes:[] },
  "VariableID:w1": { kind:"variable", name:"size/full", short:"full", type:"FLOAT", collection:"Grid", remote:true, modes:[] }
};
const LAYOUT = { mode:"HORIZONTAL", itemSpacing:4, counterAxisSpacing:null,
  paddingTop:8, paddingRight:24, paddingBottom:16, paddingLeft:12,      // every side different
  primaryAxisAlignItems:"MIN", counterAxisAlignItems:"CENTER", counterAxisAlignContent:"AUTO",
  layoutWrap:"NO_WRAP", itemReverseZIndex:false, strokesIncludedInLayout:false };

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["a"], zoom:1,
  rows:[{id:"a",name:"Row",type:"FRAME",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:false,autolayout:"HORIZONTAL",inComponent:false}]});

/* 1. uneven padding, tokens bound to padding + radius + width */
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:REFS,
  props: frame(LAYOUT, { paddingTop:"VariableID:g4", paddingLeft:"VariableID:g4",
                         topLeftRadius:"VariableID:r2", width:"VariableID:w1", itemSpacing:"VariableID:g4" }) });
check("bound + uneven padding");
console.log("padding chips:", [...D.querySelectorAll('[data-key="padV"], [data-key="padH"]')].map(e=>e.className).join(" | "));
console.log("token chips on panel:", D.querySelectorAll(".fld.tok").length);
console.log("W field keeps Fill/Hug label:",
  [...D.querySelectorAll('[data-key="w"] .tail .ib')].map(b=>b.textContent.trim()).filter(Boolean).join(",") || "(none)");
console.log("radius keeps per-corner button:",
  !!D.querySelector('[data-key="radius"] .tail .ib[title="Radius per corner"]'));

/* 2. uneven padding, NO tokens — the plain mixed case */
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:{}, props: frame(LAYOUT, {}) });
check("uneven padding, no tokens");
const pv = D.querySelector('[data-key="padV"] input'), ph = D.querySelector('[data-key="padH"] input');
console.log("padV:", JSON.stringify(pv.value), "placeholder", JSON.stringify(pv.placeholder));
console.log("padH:", JSON.stringify(ph.value), "placeholder", JSON.stringify(ph.placeholder));

/* 3. one axis even, the other not — only the uneven one reads Mixed */
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:{},
  props: frame(Object.assign({}, LAYOUT, { paddingTop:8, paddingBottom:8 }), {}) });
check("half-even padding");
console.log("padV:", JSON.stringify(D.querySelector('[data-key="padV"] input').value),
            "| padH placeholder:", JSON.stringify(D.querySelector('[data-key="padH"] input').placeholder));

/* 4. detaching from a bound padding still targets both sides */
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:REFS,
  props: frame(LAYOUT, { paddingTop:"VariableID:g4" }) });
sent.length = 0;
D.querySelector('[data-key="padV"], .fld.tok');
const chip = [...D.querySelectorAll(".fld.tok")][0];
chip.querySelector(".tail .ib").dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
console.log("detach ->", JSON.stringify(sent.find(m=>m.type==="bindVariable")));
check("detach");

console.log("\nERRORS:", errors.length ? errors : "(none)");
