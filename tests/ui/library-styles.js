const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function ev(el,type,init){ if(!el){errors.push("no el for "+type);return;} el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }
const closePop = () => D.getElementById("pop-layer").dispatchEvent(new w.MouseEvent("mousedown",{bubbles:true}));

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["t"],
  rows:[{id:"t",name:"Heading with a very long layer name that should scroll horizontally",type:"TEXT",depth:6,parentId:"x",visible:true,locked:false,hasChildren:false,expanded:false}]});
const rowEl = D.querySelector(".lrow");
const cs = w.getComputedStyle(rowEl);
console.log("row width mode:", cs.width, "| min-width:", cs.minWidth);
console.log("name truncation:", w.getComputedStyle(rowEl.querySelector(".nm")).textOverflow, "(want: clip)");
console.log("acts sticky:", w.getComputedStyle(rowEl.querySelector(".acts")).position);
console.log("indent:", rowEl.style.paddingLeft);

/* ---- text node + library styles ---- */
post({ type:"props", count:1, inspected:1, ids:["t"], types:["TEXT"], refs:{},
  props:{ id:"t",name:"Heading",type:"TEXT",visible:true,locked:false,x:0,y:0,width:200,height:40,rotation:0,
    constraints:{horizontal:"MIN",vertical:"MIN"},inAutoLayout:false,
    layoutSizingHorizontal:null,layoutSizingVertical:null,layoutPositioning:null,
    opacity:1,blendMode:"NORMAL",
    fills:[{type:"SOLID",visible:true,opacity:1,blendMode:"NORMAL",color:"#111111",colorVar:null}],fillStyleId:"",
    strokes:[],strokeStyleId:"",strokeWeight:0,strokeAlign:"CENTER",dashPattern:"",strokeSides:{top:null},
    effects:[],effectStyleId:"",exportSettings:[],boundVariables:{},childCount:0,textStyleId:"",
    text:{fontFamily:"Inter",fontStyle:"Regular",fontSize:16,lineHeight:{value:24,unit:"PIXELS"},
      letterSpacing:{value:0,unit:"PIXELS"},paragraphSpacing:0,paragraphIndent:0,
      textAlignHorizontal:"LEFT",textAlignVertical:"TOP",textCase:"ORIGINAL",textDecoration:"NONE",
      textAutoResize:"HEIGHT",textTruncation:"DISABLED",maxLines:null,leadingTrim:"NONE",characters:7} }});

/* only library styles exist — the exact situation the user hit */
post({ type:"styles",
  paint:[], text:[], effect:[], grid:[],
  library:{
    paint:[{id:"S:lib1",key:"k1",name:"Colors/Text/Primary",type:"PAINT",remote:true,color:"#1A1A1A",desc:""},
           {id:"S:lib2",key:"k2",name:"Colors/Bg/Accent",type:"PAINT",remote:true,color:"#0D99FF",desc:""}],
    text:[{id:"S:lib3",key:"k3",name:"Heading/H2",type:"TEXT",remote:true,color:null,desc:"Inter Bold · 24"}],
    effect:[{id:"S:lib4",key:"k4",name:"Elevation/2",type:"EFFECT",remote:true,color:null,desc:"2 effects"}],
    grid:[], scannedAll:false, truncated:false } });
check("library styles arrive");

/* text style picker */
ev(D.querySelector('.ib[title="Apply a text style"]'), "click");
const rows = [...D.querySelectorAll("#pop-layer .tok-row")];
console.log("text style picker groups:", [...D.querySelectorAll("#pop-layer .mgroup")].map(e=>e.textContent).join(", "));
console.log("text styles offered:", rows.map(r=>r.querySelector(".nm").textContent).join(", "));
sent.length=0; ev(rows[0], "click");
console.log("apply library text style ->", JSON.stringify(sent.find(m=>m.key==="style.text")));
check("text style picker");

/* colour picker -> library paint styles */
ev(D.querySelector(".sec .prow .sw"), "click");
console.log("cp style groups:", [...D.querySelectorAll("#pop-layer .mgroup")].map(e=>e.textContent).join(", "));
const paintRows = [...D.querySelectorAll("#pop-layer .tok-row")];
console.log("paint styles offered:", paintRows.map(r=>r.querySelector(".nm").textContent).join(", "));
sent.length=0; ev(paintRows[0], "click");
console.log("apply library paint style ->", JSON.stringify(sent.find(m=>m.key==="style.fill")));
check("colour picker library");

/* scan action */
ev(D.querySelector('.ib[title="Apply a text style"]'), "click");
const scanRow = [...D.querySelectorAll("#pop-layer .mi")].find(m=>/Index all pages/.test(m.textContent));
sent.length=0; ev(scanRow,"click");
console.log("scan ->", JSON.stringify(sent.find(m=>m.type==="rescanLibrary")));
check("scan action");

/* tokens tab shows library styles */
ev([...D.querySelectorAll(".tab")].find(t=>t.textContent==="Tokens"), "click");
post({ type:"variables", collections:[] });
post({ type:"libraryVariables", collections:[] });
console.log("tokens tab style sections:", [...D.querySelectorAll(".tb-col-hd .t")].map(e=>e.textContent).join(" | "));
console.log("library markers:", [...D.querySelectorAll(".tb-col-hd .n")].map(e=>e.textContent).join(","));
check("tokens tab");

console.log("\nERRORS:", errors.length ? errors : "(none)");
