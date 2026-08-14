const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function click(el){ if(!el){errors.push("missing element to click");return;} el.dispatchEvent(new w.MouseEvent("click",{bubbles:true,cancelable:true})); }

post({ type: "pages", pages: [{id:"0:1",name:"Page 1"}], currentPageId: "0:1" });
post({ type: "layers", pageName:"P", truncated:false, searching:false, selection:["2:1"],
  rows:[{id:"2:1",name:"Heading",type:"TEXT",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:false,expanded:false}]});

/* ---- TEXT node ---- */
post({ type:"props", count:1, inspected:1, ids:["2:1"], types:["TEXT"], refs:{},
  props:{ id:"2:1", name:"Heading", type:"TEXT", visible:true, locked:false,
    x:0,y:0,width:200,height:40,rotation:0, opacity:1, blendMode:"NORMAL",
    constraints:{horizontal:"MIN",vertical:"MIN"}, inAutoLayout:false,
    layoutSizingHorizontal:null, layoutSizingVertical:null, layoutPositioning:null,
    fills:[{type:"SOLID",visible:true,opacity:1,blendMode:"NORMAL",color:"#111111",colorVar:null}], fillStyleId:"",
    strokes:[], strokeStyleId:"", strokeWeight:0, strokeAlign:"CENTER", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", exportSettings:[], boundVariables:{}, childCount:0,
    textStyleId:"",
    text:{ fontFamily:"Inter", fontStyle:"Semi Bold", fontSize:24,
      lineHeight:{value:32,unit:"PIXELS"}, letterSpacing:{value:-2,unit:"PERCENT"},
      paragraphSpacing:0, paragraphIndent:0, textAlignHorizontal:"LEFT", textAlignVertical:"TOP",
      textCase:"ORIGINAL", textDecoration:"NONE", textAutoResize:"HEIGHT",
      textTruncation:"DISABLED", maxLines:null, leadingTrim:"NONE", characters:7 } }});
check("text props");
console.log("text sections:", [...D.querySelectorAll(".sec .sec-hd .t")].map(e=>e.textContent).join(" | "));

/* line-height field shows px, letter-spacing shows % */
const fields = [...D.querySelectorAll("[data-key]")].reduce((a,e)=>(a[e.dataset.key]=e.querySelector("input"),a),{});
console.log("lineHeight field:", JSON.stringify(fields.lineHeight && fields.lineHeight.value),
            " letterSpacing:", JSON.stringify(fields.letterSpacing && fields.letterSpacing.value),
            " fontSize:", JSON.stringify(fields.fontSize && fields.fontSize.value));

/* ---- number field: math expression + arrow keys ---- */
sent.length = 0;
const wf = fields.w;
wf.value = "100*2+10";
wf.dispatchEvent(new w.Event("blur"));
console.log("math commit ->", JSON.stringify(sent.find(m=>m.key==="width")));
sent.length = 0;
fields.fontSize.dispatchEvent(new w.KeyboardEvent("keydown",{key:"ArrowUp",shiftKey:true,bubbles:true}));
console.log("shift-arrow ->", JSON.stringify(sent.find(m=>m.key==="fontSize")));

/* ---- unit field: type "auto" ---- */
sent.length = 0;
fields.lineHeight.value = "auto";
fields.lineHeight.dispatchEvent(new w.Event("blur"));
console.log("lineHeight auto ->", JSON.stringify(sent.find(m=>m.key==="lineHeight")));
sent.length = 0;
fields.letterSpacing.value = "5%";
fields.letterSpacing.dispatchEvent(new w.Event("blur"));
console.log("letterSpacing % ->", JSON.stringify(sent.find(m=>m.key==="letterSpacing")));
check("field edits");

/* ---- colour picker ---- */
sent.length = 0;
click(D.querySelector(".sec .prow .sw"));
const cp = D.querySelector("#pop-layer .pop");
console.log("colour picker open:", !!cp, "| sv square:", !!D.querySelector(".sv"), "| sliders:", D.querySelectorAll(".slid").length);
const hexIn = cp && cp.querySelectorAll("input")[0];
if (hexIn) { hexIn.value = "FF8800"; hexIn.dispatchEvent(new w.Event("blur")); }
console.log("hex commit ->", JSON.stringify(sent.find(m=>m.key==="fill.color")));
check("colour picker");

/* ---- dropdown menu ---- */
w.document.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown",{bubbles:true}));
const blendBtn = [...D.querySelectorAll(".sec-hd .acts .ib")].find(e=>/^Blend mode/.test(e.title));
click(blendBtn);
console.log("blend menu items:", D.querySelectorAll("#pop-layer .mi").length);
check("dropdown");
w.document.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown",{bubbles:true}));

/* ---- tabs ---- */
[...D.querySelectorAll(".tab")].forEach(t => { click(t); check("tab " + t.textContent); });
console.log("tab switches ok; requested:", [...new Set(sent.map(m=>m.type))].join(","));

/* ---- tokens tab with data ---- */
click([...D.querySelectorAll(".tab")].find(t=>t.textContent==="Tokens"));
post({ type:"variables", collections:[
  { id:"C:1", name:"Primitives", remote:false, defaultModeId:"M:1",
    modes:[{id:"M:1",name:"Value"}],
    variables:[
      { id:"V:1", name:"color/bg/default", group:"color/bg", short:"default", type:"COLOR", description:"", scopes:[],
        byMode:{ "M:1": { alias:false, aliasName:null, color:"#FFFFFF", alpha:1, text:null } } },
      { id:"V:2", name:"space/md", group:"space", short:"md", type:"FLOAT", description:"", scopes:[],
        byMode:{ "M:1": { alias:false, aliasName:null, color:null, alpha:1, text:"16" } } }
    ]}]});
post({ type:"libraryVariables", collections:[
  { id:"lib:k1", key:"k1", name:"DS Colors", library:"Design System", remote:true, modes:[],
    variables:[{ id:"libvar:x1", key:"x1", name:"brand/primary", group:"brand", short:"primary", type:"COLOR", byMode:{}, libraryOnly:true }] }]});
post({ type:"styles", paint:[{id:"S:1",name:"Surface/Card",color:"#F5F5F5"}], text:[{id:"S:2",name:"Body",desc:"Inter Regular · 14"}], effect:[], grid:[] });
check("tokens tab");
console.log("token rows:", D.querySelectorAll(".tb-row").length, "| collections:", D.querySelectorAll(".tb-col").length);
sent.length = 0;
click(D.querySelector(".tb-row"));
console.log("apply token ->", JSON.stringify(sent[0]));

/* ---- prototype tab ---- */
click([...D.querySelectorAll(".tab")].find(t=>t.textContent==="Prototype"));
post({ type:"reactions", flowStarts:[], reactions:[
  { nodeId:"2:1", nodeName:"Heading", index:0, trigger:"On click", actions:["Navigate to 3:4"] }]});
check("prototype tab");
console.log("interaction rows:", D.querySelectorAll(".prow").length);

console.log("\nERRORS:", errors.length ? errors : "(none)");
