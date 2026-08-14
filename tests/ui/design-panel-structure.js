/* Reproduces the exact node from the user's Figma screenshot and dumps the
   rendered Design panel so it can be compared line by line. */
const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["t"], zoom:0.6,
  rows:[{id:"t",name:"Text",type:"TEXT",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:false,expanded:false}]});
post({ type:"styles", paint:[], text:[], effect:[], grid:[],
  library:{ paint:[{id:"S:p",key:"kp",name:"Text/Primary",type:"PAINT",remote:true,color:"#2C2C2C",desc:""}],
            text:[{id:"S:t",key:"kt",name:"Text/Body 1",type:"TEXT",remote:true,color:null,desc:"Inter Regular · 13"}],
            effect:[], grid:[], scannedAll:false, truncated:false } });
post({ type:"props", count:1, inspected:1, ids:["t"], types:["TEXT"],
  refs:{ "S:t":{kind:"style",name:"Text/Body 1",short:"Text/Body 1",type:"TEXT",remote:true,color:null},
         "S:p":{kind:"style",name:"Text/Primary",short:"Text/Primary",type:"PAINT",remote:true,color:"#2C2C2C"} },
  props:{ id:"t",name:"Text",type:"TEXT",visible:true,locked:false,
    x:0,y:1,width:615,height:18,rotation:0, opacity:1, blendMode:"NORMAL",
    constraints:{horizontal:"MIN",vertical:"MIN"},
    inAutoLayout:true, layoutPositioning:"AUTO",
    layoutSizingHorizontal:"FILL", layoutSizingVertical:"HUG",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null,
    cornerRadius:0, corners:{tl:0,tr:0,br:0,bl:0},
    fills:[{type:"SOLID",visible:true,opacity:1,blendMode:"NORMAL",color:"#2C2C2C",colorVar:null}],
    fillStyleId:"S:p",
    strokes:[], strokeStyleId:"", strokeWeight:0, strokeAlign:"CENTER", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", exportSettings:[], boundVariables:{}, childCount:0,
    textStyleId:"S:t",
    text:{ fontFamily:"Inter", fontStyle:"Regular", fontSize:13,
      lineHeight:{value:18,unit:"PIXELS"}, letterSpacing:{value:0,unit:"PIXELS"},
      paragraphSpacing:0, paragraphIndent:0, textAlignHorizontal:"LEFT", textAlignVertical:"CENTER",
      textCase:"ORIGINAL", textDecoration:"NONE", textAutoResize:"HEIGHT",
      textTruncation:"DISABLED", maxLines:null, leadingTrim:"NONE", characters:4 } }});
check("render");

console.log("TABS: " + [...D.querySelectorAll(".tab")].map(t=>t.textContent + (t.classList.contains("on")?"*":"")).join("  ") +
            "   ZOOM: " + D.getElementById("zoom-btn").textContent.trim());
console.log("");
[...D.querySelectorAll("#insp-body .sec")].forEach(sec => {
  const t = sec.querySelector(".sec-hd .t");
  const acts = [...sec.querySelectorAll(".sec-hd .acts .ib")].length;
  if (t) console.log("┌ " + t.textContent + (sec.classList.contains("empty") ? "   (collapsed)" : "") + "   [" + acts + " header icons]");
  else console.log("┌ (header row)  " + sec.textContent.trim().replace(/\s+/g," "));
  if (sec.classList.contains("empty")) return;
  [...sec.querySelectorAll(".sec-body > .grp, .sec-body > .r, .sec-body > .prow")].forEach(g => {
    const lbl = g.querySelector(":scope > .lbl");
    if (lbl) console.log("│   " + lbl.textContent);
    const parts = [];
    g.querySelectorAll(".fld, .seg, .sel, .ib, .padgrid").forEach(el => {
      if (el.closest(".fld") && !el.classList.contains("fld")) return;
      if (el.classList.contains("fld")) {
        const k = el.querySelector(".k"), inp = el.querySelector("input"),
              rn = el.querySelector(".refname"), rs = el.querySelector(".refsub"),
              mds = [...el.querySelectorAll(".tail .ib")].map(b=>b.textContent.trim()).filter(Boolean), u = el.querySelector(".unit");
        parts.push("[" + [k&&k.textContent.trim(), rn&&rn.textContent, rs&&rs.textContent.trim(),
          inp&&(inp.value||inp.placeholder), u&&u.textContent, mds.join(" ")].filter(Boolean).join(" ") +
          (el.classList.contains("ref")?"]ref":"]"));
      } else if (el.classList.contains("seg")) parts.push("(" + el.querySelectorAll(".seg-b").length + " btns" +
          (el.querySelector(".seg-b.on")?", 1 on":"") + ")");
      else if (el.classList.contains("sel")) parts.push("<" + el.querySelector(".v").textContent + ">");
      else if (el.classList.contains("padgrid")) parts.push("{3x3 pad}");
      else if (el.parentElement.classList.contains("tools")) parts.push("·" + el.title);
      else if (!el.closest(".seg") && !el.closest(".fld")) parts.push("·" + el.title);
    });
    if (parts.length) console.log("│   " + parts.join("  "));
  });
});
console.log("\nERRORS:", errors.length ? errors : "(none)");
