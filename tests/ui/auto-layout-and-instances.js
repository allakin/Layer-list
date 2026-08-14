const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function ev(el,type,init){ el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }
function pev(el,type,init){ const e=new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init)); e.pointerId=1; el.dispatchEvent(e); }
// give rows a real geometry so drop-zone maths can run
let top = 0;
function stubRects(){
  [...D.querySelectorAll(".lrow")].forEach((el)=>{ const t = top; el.getBoundingClientRect = ()=>({top:t,bottom:t+24,left:0,right:200,width:200,height:24}); top += 24; });
  D.getElementById("tree").getBoundingClientRect = ()=>({top:0,bottom:400,left:0,right:200,width:200,height:400});
}

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
const rows = [
  {id:"a",name:"Frame A",type:"FRAME",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:true},
  {id:"b",name:"Text B",type:"TEXT",depth:1,parentId:"a",visible:true,locked:false,hasChildren:false,expanded:false},
  {id:"c",name:"Rect C",type:"RECTANGLE",depth:1,parentId:"a",visible:true,locked:false,hasChildren:false,expanded:false}
];
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["c"], rows });
top = 0; stubRects();

/* ---- drag Rect C onto the top edge of Text B (=> reorder above) ---- */
const c = D.querySelector('.lrow[data-id="c"]');
pev(c,"pointerdown",{button:0,clientX:50,clientY:60});
sent.length = 0;
const mv = new w.MouseEvent("pointermove",{bubbles:true,clientX:50,clientY:27}); mv.pointerId=1;
w.dispatchEvent(mv);
console.log("drop hint:", !!D.getElementById("drop-line") || !!D.getElementById("drop-box"));
const up = new w.MouseEvent("pointerup",{bubbles:true,clientX:50,clientY:27}); up.pointerId=1;
w.dispatchEvent(up);
console.log("drag above ->", JSON.stringify(sent.find(m=>m.type==="move")));
check("drag reorder");

/* ---- drag onto the middle of Frame A (=> drop inside) ---- */
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["c"], rows });
top = 0; stubRects();
const c2 = D.querySelector('.lrow[data-id="c"]');
pev(c2,"pointerdown",{button:0,clientX:50,clientY:60});
sent.length = 0;
const mv2 = new w.MouseEvent("pointermove",{bubbles:true,clientX:50,clientY:12}); mv2.pointerId=1;
w.dispatchEvent(mv2);
const up2 = new w.MouseEvent("pointerup",{bubbles:true,clientX:50,clientY:12}); up2.pointerId=1;
w.dispatchEvent(up2);
console.log("drag inside ->", JSON.stringify(sent.find(m=>m.type==="move")));
check("drag reparent");

/* ---- auto-layout frame: alignment pad, gap auto, popovers ---- */
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"],
  refs:{ "VariableID:9":{kind:"variable",name:"space/lg",short:"lg",type:"FLOAT",collection:"Core",remote:false,modes:[]} },
  props:{ id:"a",name:"Frame A",type:"FRAME",visible:true,locked:false,
    x:0,y:0,width:300,height:200,rotation:0,cornerRadius:8,corners:{tl:8,tr:8,br:8,bl:8},cornerSmoothing:0,
    constraints:{horizontal:"MIN",vertical:"MIN"},
    layoutMode:"HORIZONTAL",
    layout:{mode:"HORIZONTAL",itemSpacing:12,counterAxisSpacing:null,paddingTop:8,paddingRight:16,paddingBottom:8,paddingLeft:16,
      primaryAxisAlignItems:"SPACE_BETWEEN",counterAxisAlignItems:"CENTER",counterAxisAlignContent:"AUTO",
      layoutWrap:"NO_WRAP",itemReverseZIndex:false,strokesIncludedInLayout:false},
    clipsContent:true,overflowDirection:"NONE",
    layoutSizingHorizontal:"FIXED",layoutSizingVertical:"HUG",layoutPositioning:"AUTO",
    minWidth:null,maxWidth:400,minHeight:null,maxHeight:null,inAutoLayout:true,
    opacity:1,blendMode:"PASS_THROUGH",
    fills:[],fillStyleId:"",strokes:[],strokeStyleId:"",strokeWeight:0,strokeAlign:"INSIDE",dashPattern:"",strokeSides:{top:null},
    effects:[],effectStyleId:"",layoutGrids:[],gridStyleId:"",exportSettings:[],
    boundVariables:{ paddingLeft:"VariableID:9" },
    variableModes:[{collectionId:"C:1",modeId:"M:2"}], childCount:2 }});
check("auto layout props");
console.log("align pad cells:", D.querySelectorAll(".padgrid .c").length, "| active:", D.querySelectorAll(".padgrid .c.on").length);
const gapInput = D.querySelector('[data-key="gap"] input');
console.log("gap shows Auto:", gapInput && gapInput.placeholder);
console.log("padH is token chip:", !!D.querySelector('[data-key="padH"], .fld.tok'));
console.log("absolute-position toggle:", !!D.querySelector('.sec .acts .ib[title*="absolute"]'));

/* alignment pad click */
sent.length=0;
ev(D.querySelectorAll(".padgrid .c")[8],"click");
console.log("pad click ->", sent.map(m=>m.key+"="+m.value).join(", "));

/* padding popover */
ev(D.querySelector('.ib[title="Padding per side"]'),"click");
console.log("padding popover fields:", D.querySelectorAll("#pop-layer .fld").length);
D.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown",{bubbles:true}));

/* corner popover */
ev(D.querySelector('.ib[title="Radius per corner"]'),"click");
console.log("corner popover fields:", D.querySelectorAll("#pop-layer .fld").length);
D.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown",{bubbles:true}));

/* min/max popover */
ev(D.querySelector('.ib[title^="Advanced layout"]'),"click");
console.log("advanced popover fields:", D.querySelectorAll("#pop-layer .fld").length, "| stacking:", D.querySelectorAll("#pop-layer .seg-b").length);
D.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown",{bubbles:true}));
check("popovers");

/* variable modes */
post({ type:"modeCollections", collections:[{id:"C:1",name:"Theme",defaultModeId:"M:1",modes:[{id:"M:1",name:"Light"},{id:"M:2",name:"Dark"}]}] });
const vmSec = [...D.querySelectorAll(".sec .sec-hd .t")].find(e=>e.textContent==="Variable modes");
console.log("variable modes section:", !!vmSec, "| current:", vmSec && vmSec.closest(".sec").querySelector(".sel .v").textContent);
check("variable modes");

/* ---- instance ---- */
post({ type:"props", count:1, inspected:1, ids:["i"], types:["INSTANCE"], refs:{},
  props:{ id:"i",name:"Button",type:"INSTANCE",visible:true,locked:false,x:0,y:0,width:100,height:40,rotation:0,
    constraints:{horizontal:"MIN",vertical:"MIN"},inAutoLayout:false,
    layoutSizingHorizontal:null,layoutSizingVertical:null,layoutPositioning:null,
    opacity:1,blendMode:"PASS_THROUGH",fills:[],fillStyleId:"",strokes:[],strokeStyleId:"",
    strokeWeight:0,strokeAlign:"INSIDE",dashPattern:"",strokeSides:{top:null},
    effects:[],effectStyleId:"",exportSettings:[],boundVariables:{},childCount:1,
    instance:{ exposed:0, properties:[
      {key:"Size#1:0",label:"Size",type:"VARIANT",value:"Large",options:["Small","Large"]},
      {key:"Icon#2:0",label:"Icon",type:"BOOLEAN",value:true,options:null},
      {key:"Label#3:0",label:"Label",type:"TEXT",value:"Click me",options:null}]} }});
check("instance props");
console.log("instance section:", !!D.querySelector(".sec .sec-hd .t") && [...D.querySelectorAll(".sec .sec-hd .t")].map(e=>e.textContent).join(" | "));
sent.length=0;
const variantSel = [...D.querySelectorAll(".sel .v")].find(e=>e.textContent==="Large");
ev(variantSel.closest(".sel"),"click");
const small = [...D.querySelectorAll("#pop-layer .mi")].find(m=>/Small/.test(m.textContent));
ev(small,"click");
console.log("variant switch ->", JSON.stringify(sent.find(m=>m.key==="instanceProp")));
check("instance edit");

/* ---- export section collapses when unused ---- */
const expSec = [...D.querySelectorAll(".sec")].find(s=>{const t=s.querySelector(".sec-hd .t");return t&&t.textContent==="Export";});
console.log("export collapsed:", expSec && expSec.classList.contains("empty"), "| has +:", !!(expSec&&expSec.querySelector(".acts .ib")));

console.log("\nERRORS:", errors.length ? errors : "(none)");
