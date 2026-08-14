const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function ev(el,type,init){ if(!el){errors.push("no el for "+type);return;} el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["a"], zoom:1.1,
  rows:[{id:"a",name:"Frame",type:"FRAME",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:false}]});
post({ type:"props", count:1, inspected:1, ids:["a"], types:["FRAME"],
  refs:{ "VariableID:g4":{kind:"variable",name:"g-spacing-4",short:"g-spacing-4",type:"FLOAT",collection:"Grid",remote:true,modes:[]} },
  props:{ id:"a",name:"Frame",type:"FRAME",visible:true,locked:false,x:0,y:0,width:116,height:17,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0}, cornerSmoothing:0,
    constraints:{horizontal:"MIN",vertical:"MIN"}, layoutMode:"VERTICAL",
    layout:{mode:"VERTICAL",itemSpacing:4,counterAxisSpacing:null,paddingTop:0,paddingRight:0,paddingBottom:0,paddingLeft:0,
      primaryAxisAlignItems:"MIN",counterAxisAlignItems:"MIN",counterAxisAlignContent:"AUTO",
      layoutWrap:"NO_WRAP",itemReverseZIndex:false,strokesIncludedInLayout:false},
    clipsContent:false, layoutSizingHorizontal:"FIXED", layoutSizingVertical:"FIXED", layoutPositioning:"AUTO",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null, inAutoLayout:false,
    opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
    strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", layoutGrids:[], gridStyleId:"", exportSettings:[],
    boundVariables:{ itemSpacing:"VariableID:g4" }, childCount:2 }});

/* the file has NO local collections, and teamLibrary blew up */
post({ type:"variables", collections:[] });
post({ type:"libraryVariables", collections:[], teamLibraryError:"Cannot read team library from this file", scannedAll:false });
check("empty state");

ev(D.querySelector('[data-key="radius"] .tail .ib'), "click");
console.log("BEFORE SCAN");
console.log("  message:", [...D.querySelectorAll("#pop-layer .hint")].map(e=>e.textContent.trim()).join(" / "));
console.log("  scan row:", [...D.querySelectorAll("#pop-layer .mi .t")].map(e=>e.textContent).join(" | "));
sent.length=0;
ev([...D.querySelectorAll("#pop-layer .mi")].find(m=>/Index all pages/.test(m.textContent)), "click");
console.log("  action ->", JSON.stringify(sent.find(m=>m.type==="rescanLibrary")));
check("scan trigger");

/* the scan finds the library collection actually used in the document */
post({ type:"libraryVariables", scannedAll:true, teamLibraryError:"Cannot read team library from this file",
  collections:[{ key:"grid-key", id:"VariableCollectionId:grid", name:"Grid", library:"in use", remote:true,
    defaultModeId:"M:1", modes:[{id:"M:1",name:"Mode 1"}],
    variables:[
      { id:"VariableID:g4", key:"kg4", name:"g-spacing-4", group:"", short:"g-spacing-4", type:"FLOAT",
        byMode:{ "M:1":{alias:false,aliasName:null,color:null,alpha:1,text:"4"} } },
      { id:"VariableID:g8", key:"kg8", name:"g-spacing-8", group:"", short:"g-spacing-8", type:"FLOAT",
        byMode:{ "M:1":{alias:false,aliasName:null,color:null,alpha:1,text:"8"} } },
      { id:"VariableID:r2", key:"kr2", name:"radius/2", group:"radius", short:"2", type:"FLOAT",
        byMode:{ "M:1":{alias:false,aliasName:null,color:null,alpha:1,text:"2"} } }
    ]}]});
check("after scan");

ev(D.querySelector('[data-key="radius"] .tail .ib'), "click");
console.log("\nAFTER SCAN");
console.log("  groups:", [...D.querySelectorAll("#pop-layer .mgroup")].map(e=>e.textContent).join(" | "));
console.log("  tokens:", [...D.querySelectorAll("#pop-layer .tok-row")].map(r=>r.querySelector(".nm").textContent + "=" + r.querySelector(".val").textContent).join(", "));
sent.length=0;
ev([...D.querySelectorAll("#pop-layer .tok-row")].find(r=>/radius\/2/.test(r.textContent)), "click");
console.log("  bind ->", JSON.stringify(sent.find(m=>m.type==="bindVariable")));
check("bind after scan");

console.log("\nERRORS:", errors.length ? errors : "(none)");
