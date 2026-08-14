/* The rotate arrows are single filled paths from Gravity UI; they must render as
   fill, not as a stroked outline. */
const { w, errors, post, check } = require("../harness/ui.js");
const D = w.document;

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["t"], zoom:1,
  rows:[{id:"t",name:"Text",type:"TEXT",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:false,expanded:false,inComponent:false}]});
post({ type:"styles", paint:[], text:[], effect:[], grid:[],
  library:{ paint:[], text:[{id:"S:t",key:"kt",name:"Text/Body 1",type:"TEXT",remote:true,desc:"Inter Regular · 13",color:null}],
            effect:[], grid:[], scannedAll:true, savedAt:Date.now() } });
post({ type:"props", count:1, inspected:1, ids:["t"], types:["TEXT"],
  refs:{ "S:t":{kind:"style",name:"Text/Body 1",short:"Text/Body 1",type:"TEXT",remote:true,color:null} },
  props:{ id:"t",name:"Text",type:"TEXT",visible:true,locked:false,x:0,y:0,width:200,height:20,rotation:0,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0},
    constraints:{horizontal:"MIN",vertical:"MIN"}, inAutoLayout:false,
    layoutSizingHorizontal:null,layoutSizingVertical:null,layoutPositioning:null,
    opacity:1, blendMode:"NORMAL",
    fills:[{type:"SOLID",visible:true,opacity:1,blendMode:"NORMAL",color:"#111",colorVar:null}], fillStyleId:"",
    strokes:[], strokeStyleId:"", strokeWeight:0, strokeAlign:"CENTER", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", exportSettings:[], boundVariables:{}, childCount:0, textStyleId:"S:t",
    text:{ fontFamily:"Inter", fontStyle:"Regular", fontSize:13,
      lineHeight:{value:18,unit:"PIXELS"}, letterSpacing:{value:0,unit:"PIXELS"},
      paragraphSpacing:0, paragraphIndent:0, textAlignHorizontal:"LEFT", textAlignVertical:"TOP",
      textCase:"ORIGINAL", textDecoration:"NONE", textAutoResize:"HEIGHT",
      textTruncation:"DISABLED", maxLines:null, leadingTrim:"NONE", characters:4 } }});
check("render");

function svgOf(el) { return el && el.querySelector("svg"); }

/* the blue style-applied indicator on Typography uses reset */
const typoBtn = [...D.querySelectorAll(".sec-hd .acts .ib")]
  .find(b => /Text style applied/.test(b.title));
const a = svgOf(typoBtn);
console.log("Typography indicator:", !!typoBtn);
console.log("  svg fill / stroke:  ", a.getAttribute("fill"), "/", a.getAttribute("stroke"));
console.log("  paths:              ", a.querySelectorAll("path").length, "(Gravity ships one)");
console.log("  fill-rule:          ", a.querySelector("path").getAttribute("fill-rule"));
console.log("  is the Gravity path:", /6\.5 0 0 1 1-6\.445 7\.348|6\.445 7\.348/.test(a.querySelector("path").getAttribute("d")));
console.log("  brand coloured:     ", typoBtn.classList.contains("brand"));

/* the reload button in the top bar uses refresh */
const b = svgOf(D.getElementById("btn-refresh"));
console.log("\nTop-bar reload:");
console.log("  svg fill / stroke:  ", b.getAttribute("fill"), "/", b.getAttribute("stroke"));
console.log("  rotates the other way:", /1 0 6\.445 7\.348/.test(b.querySelector("path").getAttribute("d")));

/* every other icon must still be stroked */
const strokeIcon = svgOf(D.getElementById("btn-collapse"));
console.log("\nan ordinary icon stays stroked:", strokeIcon.getAttribute("stroke"), "/ fill", strokeIcon.getAttribute("fill"));

console.log("\nERRORS:", errors.length ? errors : "(none)");
