/* Duplicates must not reach any picker. */
const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function ev(el,type,init){ if(!el){errors.push("no el for "+type);return;} el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }
const closePop = () => D.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown",{bubbles:true}));

/* the same library text style arriving under four local ids, plus two rows that
   share a key, plus one genuinely distinct style */
const TEXT_STYLES = [
  { id:"S:1", key:"kBody",  name:"Text/Body 1", type:"TEXT", remote:true, desc:"YS Text Regular · 13", color:null },
  { id:"S:2", key:"kBody",  name:"Text/Body 1", type:"TEXT", remote:true, desc:"YS Text Regular · 13", color:null },
  { id:"S:3", key:"kBody2", name:"Text/Body 1", type:"TEXT", remote:true, desc:"YS Text Regular · 13", color:null },
  { id:"S:4", key:"kBody3", name:"Text/Body 1", type:"TEXT", remote:true, desc:"YS Text Regular · 13", color:null },
  { id:"S:5", key:"k1318a", name:"Text/13:18 — Body", type:"TEXT", remote:true, desc:"YS Text Regular · 13", color:null },
  { id:"S:6", key:"k1318b", name:"Text/13:18 — Body", type:"TEXT", remote:true, desc:"YS Text Regular · 13", color:null },
  { id:"S:7", key:"kCap",   name:"Text/11:16 — Caption", type:"TEXT", remote:true, desc:"YS Text Regular · 11", color:null }
];
const PAINT_STYLES = [
  { id:"P:1", key:"kP", name:"Colors/Text/Primary", type:"PAINT", remote:true, desc:"", color:"#1A1A1A" },
  { id:"P:2", key:"kP", name:"Colors/Text/Primary", type:"PAINT", remote:true, desc:"", color:"#1A1A1A" },
  { id:"P:3", key:"kP2", name:"Colors/Bg/Accent",   type:"PAINT", remote:true, desc:"", color:"#0D99FF" }
];
const TOKENS = [
  { id:"V:1", key:"kg4", name:"g-spacing-4", group:"", short:"g-spacing-4", type:"FLOAT", byMode:{ "M:1":{alias:false,color:null,text:"4",alpha:1} } },
  { id:"V:2", key:"kg4", name:"g-spacing-4", group:"", short:"g-spacing-4", type:"FLOAT", byMode:{ "M:1":{alias:false,color:null,text:"4",alpha:1} } },
  { id:"V:3", key:"kg8", name:"g-spacing-8", group:"", short:"g-spacing-8", type:"FLOAT", byMode:{ "M:1":{alias:false,color:null,text:"8",alpha:1} } },
  { id:"V:4", key:"kc1", name:"color/bg",    group:"", short:"bg",          type:"COLOR", byMode:{ "M:1":{alias:false,color:"#FFFFFF",text:null,alpha:1} } }
];

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["t"], zoom:1,
  rows:[{id:"t",name:"Text",type:"TEXT",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:false,expanded:false,inComponent:false}]});
post({ type:"styles", paint:[], text:[], effect:[], grid:[],
  library:{ paint:PAINT_STYLES, text:TEXT_STYLES, effect:[], grid:[], scannedAll:true, savedAt:Date.now() } });
post({ type:"variables", collections:[] });
post({ type:"libraryVariables", collections:[
  { id:"C:1", key:"kcol", name:"Grid", library:"in use", remote:true, defaultModeId:"M:1",
    modes:[{id:"M:1",name:"Mode 1"}], variables:TOKENS }] });
post({ type:"props", count:1, inspected:1, ids:["t"], types:["TEXT"], refs:{},
  props:{ id:"t",name:"Text",type:"TEXT",visible:true,locked:false,x:0,y:0,width:200,height:20,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0},
    constraints:{horizontal:"MIN",vertical:"MIN"}, inAutoLayout:false,
    layoutSizingHorizontal:null,layoutSizingVertical:null,layoutPositioning:null,
    opacity:1, blendMode:"NORMAL",
    fills:[{type:"SOLID",visible:true,opacity:1,blendMode:"NORMAL",color:"#111111",colorVar:null}], fillStyleId:"",
    strokes:[], strokeStyleId:"", strokeWeight:0, strokeAlign:"CENTER", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", exportSettings:[], boundVariables:{}, childCount:0, textStyleId:"",
    text:{ fontFamily:"Inter", fontStyle:"Regular", fontSize:13,
      lineHeight:{value:18,unit:"PIXELS"}, letterSpacing:{value:0,unit:"PIXELS"},
      paragraphSpacing:0, paragraphIndent:0, textAlignHorizontal:"LEFT", textAlignVertical:"TOP",
      textCase:"ORIGINAL", textDecoration:"NONE", textAutoResize:"HEIGHT",
      textTruncation:"DISABLED", maxLines:null, leadingTrim:"NONE", characters:4 } }});
check("render");

function rows() { return [...D.querySelectorAll("#pop-layer .tok-row .nm")].map(e=>e.textContent); }
function report(tag, list, fed) {
  const counts = {};
  list.forEach(n => { counts[n] = (counts[n]||0)+1; });
  const dupes = Object.keys(counts).filter(k => counts[k] > 1);
  console.log(tag.padEnd(22), "fed " + fed + " → shown " + list.length,
    "| duplicates: " + (dupes.length ? dupes.join(", ") : "none"));
}

/* text style picker */
ev(D.querySelector('.ib[title^="Apply a text style"]'), "click");
report("text styles", rows(), TEXT_STYLES.length);
console.log("  " + rows().join(" / "));
closePop();

/* colour picker → paint styles + colour tokens */
ev(D.querySelector(".sec .prow .sw"), "click");
report("paint styles+tokens", rows(), PAINT_STYLES.length + 1);
console.log("  " + rows().join(" / "));
closePop();

/* numeric field token picker */
ev(D.querySelector('[data-key="fontSize"] .tail .ib'), "click");
report("float tokens", rows(), 3);
console.log("  " + rows().join(" / "));
closePop();

/* Tokens tab */
ev([...D.querySelectorAll(".tab")].find(t=>t.textContent==="Tokens"), "click");
const tabRows = [...D.querySelectorAll(".tb-row .nm")].map(e=>e.textContent);
report("tokens tab", tabRows, TOKENS.length + TEXT_STYLES.length + PAINT_STYLES.length);
console.log("  " + tabRows.join(" / "));

/* font picker */
ev([...D.querySelectorAll(".tab")].find(t=>t.textContent==="Design"), "click");
post({ type:"fonts", fonts:[{family:"Inter",styles:["Regular"]},{family:"Inter",styles:["Regular"]},{family:"Roboto",styles:["Regular"]}] });
ev(D.querySelector(".sec .fld.ref"), "click");
report("fonts", rows(), 3);
closePop();

console.log("\nERRORS:", errors.length ? errors : "(none)");
