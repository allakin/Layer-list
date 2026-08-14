const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function ev(el,type,init){ if(!el){errors.push("no el for "+type);return;} el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["a"], zoom:1,
  rows:[{id:"a",name:"Row",type:"FRAME",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:false}]});
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"], refs:{},
  props:{ id:"a",name:"Row",type:"FRAME",visible:true,locked:false,x:0,y:0,width:1164,height:36,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0}, cornerSmoothing:0,
    constraints:{horizontal:"MIN",vertical:"MIN"},
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
check("render");

/* every field the user pointed at now carries a visible token button */
["padV","padH","radius","gap","w","h","opacity"].forEach(function (k) {
  const fld = D.querySelector('[data-key="'+k+'"]');
  const btn = fld && fld.querySelector('.tail .ib[title="Apply a variable"]');
  console.log(k.padEnd(8), "token button:", !!btn);
});

/* opening it lists library tokens */
post({ type:"variables", collections:[
  { id:"C:1", name:"Primitives", remote:false, defaultModeId:"M:1", modes:[{id:"M:1",name:"Value"}],
    variables:[{ id:"V:1", name:"space/md", group:"space", short:"md", type:"FLOAT", description:"", scopes:[],
      byMode:{ "M:1": { alias:false, aliasName:null, color:null, alpha:1, text:"16" } } }] }]});
post({ type:"libraryVariables", collections:[
  { id:"lib:k1", key:"k1", name:"Spacing", library:"Design System", remote:true, modes:[],
    variables:[{ id:"libvar:s8", key:"s8", name:"spacing/8", group:"spacing", short:"8", type:"FLOAT", byMode:{}, libraryOnly:true },
               { id:"libvar:c4", key:"c4", name:"radius/sm", group:"radius", short:"sm", type:"FLOAT", byMode:{}, libraryOnly:true }] }]});

ev(D.querySelector('[data-key="padV"] .tail .ib'), "click");
console.log("\npicker groups:", [...D.querySelectorAll("#pop-layer .mgroup")].map(e=>e.textContent).join(" | "));
console.log("tokens:", [...D.querySelectorAll("#pop-layer .tok-row .nm")].map(e=>e.textContent).join(", "));
sent.length=0;
ev([...D.querySelectorAll("#pop-layer .tok-row")].find(r=>/spacing\/8/.test(r.textContent)), "click");
console.log("bind vertical padding ->", JSON.stringify(sent.find(m=>m.type==="bindVariable")));
check("padding token");

ev(D.querySelector('[data-key="radius"] .tail .ib'), "click");
sent.length=0;
ev([...D.querySelectorAll("#pop-layer .tok-row")].find(r=>/radius\/sm/.test(r.textContent)), "click");
console.log("bind corner radius  ->", JSON.stringify(sent.find(m=>m.type==="bindVariable")));
check("radius token");

/* once bound, the field turns into a chip with a detach button */
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"],
  refs:{ "VariableID:9":{kind:"variable",name:"spacing/8",short:"8",type:"FLOAT",collection:"Spacing",remote:true,modes:[]} },
  props: Object.assign({}, JSON.parse(JSON.stringify({
    id:"a",name:"Row",type:"FRAME",visible:true,locked:false,x:0,y:0,width:1164,height:36,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0}, cornerSmoothing:0,
    constraints:{horizontal:"MIN",vertical:"MIN"}, layoutMode:"HORIZONTAL",
    layout:{mode:"HORIZONTAL",itemSpacing:0,counterAxisSpacing:null,paddingTop:8,paddingRight:0,paddingBottom:8,paddingLeft:0,
      primaryAxisAlignItems:"MIN",counterAxisAlignItems:"CENTER",counterAxisAlignContent:"AUTO",
      layoutWrap:"NO_WRAP",itemReverseZIndex:false,strokesIncludedInLayout:false},
    clipsContent:false, layoutSizingHorizontal:"FIXED", layoutSizingVertical:"FIXED", layoutPositioning:"AUTO",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null, inAutoLayout:false,
    opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
    strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null}, effects:[], effectStyleId:"",
    layoutGrids:[], gridStyleId:"", exportSettings:[], childCount:3 })), { boundVariables:{ paddingTop:"VariableID:9" } }) });
const chip = D.querySelector('.fld.tok');
console.log("\nbound field renders chip:", !!chip, "| label:", chip && chip.querySelector(".tk").textContent);
sent.length=0;
ev(chip.querySelector('.tail .ib'), "click");
console.log("detach ->", JSON.stringify(sent.find(m=>m.type==="bindVariable")));
check("chip");

console.log("\nERRORS:", errors.length ? errors : "(none)");
