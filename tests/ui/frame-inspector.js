const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
check("boot");

/* ---- feed a realistic document ---- */
post({ type: "pages", pages: [{id:"0:1",name:"Page 1"},{id:"0:2",name:"Icons"}], currentPageId: "0:1" });
post({ type: "layers", pageName: "Page 1", truncated: false, searching: false,
  selection: ["1:2"],
  rows: [
    { id:"1:1", name:"Cover", type:"SECTION", depth:0, parentId:"0:1", visible:true, locked:false, hasChildren:true, expanded:true },
    { id:"1:2", name:"Card / Primary", type:"FRAME", depth:1, parentId:"1:1", visible:true, locked:false, hasChildren:true, expanded:true, autolayout:"VERTICAL" },
    { id:"1:3", name:"Title", type:"TEXT", depth:2, parentId:"1:2", visible:true, locked:false, hasChildren:false, expanded:false },
    { id:"1:4", name:"Avatar", type:"INSTANCE", depth:2, parentId:"1:2", visible:false, locked:true, hasChildren:true, expanded:false },
    { id:"1:5", name:"Mask", type:"RECTANGLE", depth:2, parentId:"1:2", visible:true, locked:false, hasChildren:false, expanded:false, mask:true }
  ]});
check("layers");
console.log("rows rendered:", D.querySelectorAll(".lrow").length);

/* ---- a rich frame selection ---- */
const refs = {
  "VariableID:1:10": { kind:"variable", name:"space/md", short:"md", type:"FLOAT", collection:"Primitives", remote:false, modes:[] },
  "VariableID:1:11": { kind:"variable", name:"color/bg/subtle", short:"subtle", type:"COLOR", collection:"Semantic", remote:true, modes:[] },
  "S:abc": { kind:"style", name:"Elevation/Card", short:"Card", type:"EFFECT", remote:false, color:null }
};
post({ type: "props", count: 1, inspected: 1, ids:["1:2"], types:["FRAME"], refs,
  props: {
    id:"1:2", name:"Card / Primary", type:"FRAME", visible:true, locked:false, isMask:false,
    x:24, y:40, width:320, height:180, rotation:0,
    cornerRadius:12, corners:{tl:12,tr:12,br:12,bl:12}, cornerSmoothing:0,
    constraints:{horizontal:"MIN",vertical:"MIN"},
    layoutMode:"VERTICAL",
    layout:{ mode:"VERTICAL", itemSpacing:8, counterAxisSpacing:null, paddingTop:16, paddingRight:16,
      paddingBottom:16, paddingLeft:16, primaryAxisAlignItems:"MIN", counterAxisAlignItems:"CENTER",
      counterAxisAlignContent:"AUTO", layoutWrap:"NO_WRAP", itemReverseZIndex:false, strokesIncludedInLayout:false },
    clipsContent:true, overflowDirection:"NONE", hasReactions:1,
    layoutSizingHorizontal:"FIXED", layoutSizingVertical:"HUG", layoutPositioning:"AUTO",
    layoutGrow:0, layoutAlign:"INHERIT", minWidth:null, maxWidth:null, minHeight:null, maxHeight:null,
    inAutoLayout:false, opacity:1, blendMode:"PASS_THROUGH",
    fills:[{type:"SOLID",visible:true,opacity:1,blendMode:"NORMAL",color:"#FFFFFF",colorVar:"VariableID:1:11"},
           {type:"GRADIENT_LINEAR",visible:true,opacity:0.5,blendMode:"NORMAL",
            stops:[{color:"#FF0000",a:1,pos:0},{color:"#0000FF",a:0,pos:1}], transform:[[1,0,0],[0,1,0]], stopVars:[null,null]}],
    fillStyleId:"",
    strokes:[{type:"SOLID",visible:true,opacity:1,blendMode:"NORMAL",color:"#000000",colorVar:null}],
    strokeStyleId:"", strokeWeight:1, strokeAlign:"INSIDE", strokeCap:"NONE", strokeJoin:"MITER",
    strokeMiterLimit:4, dashPattern:"", strokeSides:{top:1,right:1,bottom:1,left:1},
    effects:[{type:"DROP_SHADOW",visible:true,radius:8,color:"#000000",alpha:0.15,offsetX:0,offsetY:4,spread:0,blendMode:"NORMAL",behind:false,vars:null},
             {type:"LAYER_BLUR",visible:true,radius:4,vars:null}],
    effectStyleId:"S:abc",
    layoutGrids:[{pattern:"COLUMNS",visible:true,color:"#FF0000",alpha:0.1,sectionSize:100,count:4,gutterSize:20,offset:0,alignment:"STRETCH",vars:null}],
    gridStyleId:"",
    exportSettings:[{format:"PNG",suffix:"@2x",constraintType:"SCALE",constraintValue:2}],
    boundVariables:{ itemSpacing:"VariableID:1:10" },
    variableModes:[{collectionId:"C:1",modeId:"M:2"}],
    parent:{id:"1:1",name:"Cover",type:"SECTION"}, childCount:3
  }});
check("props frame");
console.log("sections:", [...D.querySelectorAll(".sec .sec-hd .t")].map(e=>e.textContent).join(" | "));
console.log("token chips:", D.querySelectorAll(".fld.tok, .chip").length);

console.log("\nERRORS:", errors.length ? errors : "(none)");
