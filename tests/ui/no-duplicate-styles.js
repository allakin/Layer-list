/*
 * Duplicates must not reach any picker.
 *
 * A file accumulates several local ids for one library entry, so the same style
 * or token arrives over and over — and it arrives through more than one door:
 *   · several local ids sharing one library key;
 *   · two keys that render as the same row;
 *   · a library style the local enumeration also hands back, which lands in the
 *     "Local styles" and "Library styles" groups of the same list;
 *   · a token the document scan found and the team-library catalogue lists too,
 *     which arrives as two collections.
 * The last two are one list drawn as several groups, so the dedupe has to span
 * the groups, not restart at each one.
 *
 * This file used to print its duplicate counts without asserting them, which is
 * how a regression walked through a passing run. Every count is an expect() now.
 */
const { w, errors, sent, post, check, expect } = require("../harness/ui.js");
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
/* the same two entries as the local enumeration sees them — one list, two groups */
const LOCAL_PAINT = [
  { id:"P:9", key:"kP", name:"Colors/Text/Primary", type:"PAINT", remote:false, desc:"", color:"#1A1A1A" }
];
const LOCAL_TEXT = [
  { id:"S:9", key:"kBody", name:"Text/Body 1", type:"TEXT", remote:false, desc:"YS Text Regular · 13", color:null }
];
const TOKENS = [
  { id:"V:1", key:"kg4", name:"g-spacing-4", group:"", short:"g-spacing-4", type:"FLOAT", byMode:{ "M:1":{alias:false,color:null,text:"4",alpha:1} } },
  { id:"V:2", key:"kg4", name:"g-spacing-4", group:"", short:"g-spacing-4", type:"FLOAT", byMode:{ "M:1":{alias:false,color:null,text:"4",alpha:1} } },
  { id:"V:3", key:"kg8", name:"g-spacing-8", group:"", short:"g-spacing-8", type:"FLOAT", byMode:{ "M:1":{alias:false,color:null,text:"8",alpha:1} } },
  { id:"V:4", key:"kc1", name:"color/bg",    group:"", short:"bg",          type:"COLOR", byMode:{ "M:1":{alias:false,color:"#FFFFFF",text:null,alpha:1} } }
];
/* what the catalogue lists for the same library: the keys the scan already has */
const CATALOGUE = [
  { id:"libvar:kg4", key:"kg4", name:"g-spacing-4", group:"", short:"g-spacing-4", type:"FLOAT", byMode:{}, libraryOnly:true },
  { id:"libvar:kc1", key:"kc1", name:"color/bg",    group:"", short:"bg",          type:"COLOR", byMode:{}, libraryOnly:true },
  { id:"libvar:kc2", key:"kc2", name:"color/bg/subtle", group:"color/bg", short:"subtle", type:"COLOR", byMode:{}, libraryOnly:true }
];

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["t"], zoom:1,
  rows:[{id:"t",name:"Text",type:"TEXT",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:false,expanded:false,inComponent:false}]});
post({ type:"styles", paint:LOCAL_PAINT, text:LOCAL_TEXT, effect:[], grid:[],
  library:{ paint:PAINT_STYLES, text:TEXT_STYLES, effect:[], grid:[], scannedAll:true, savedAt:Date.now() } });
post({ type:"variables", collections:[] });
post({ type:"libraryVariables", collections:[
  { id:"C:1", key:"kcol", name:"Grid", library:"in use", remote:true, defaultModeId:"M:1",
    modes:[{id:"M:1",name:"Mode 1"}], variables:TOKENS },
  { id:"C:2", key:"kcol2", name:"Grid", library:"Design system", remote:true, defaultModeId:null,
    modes:[], variables:CATALOGUE }] });
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
/* Asserting, not just printing: a count nobody checks is a count that can drift. */
function report(tag, list, fed) {
  const counts = {};
  list.forEach(n => { counts[n] = (counts[n]||0)+1; });
  const dupes = Object.keys(counts).filter(k => counts[k] > 1);
  console.log("  " + tag.padEnd(22), "fed " + fed + " → shown " + list.length,
    "| duplicates: " + (dupes.length ? dupes.join(", ") : "none"));
  console.log("    " + list.join(" / "));
  expect(tag + ": nothing is listed twice", dupes.length === 0);
  expect(tag + ": and the list is not empty", list.length > 0);
  return counts;
}

/* text style picker — four local ids and three keys for one style, and the local
   enumeration hands the same style back on top of that */
ev(D.querySelector('.ib[title^="Apply a text style"]'), "click");
let seen = report("text styles", rows(), TEXT_STYLES.length + LOCAL_TEXT.length);
expect("the shared key survives once across both groups", seen["Text/Body 1"] === 1);
expect("and the styles that differ are all still there",
  seen["Text/13:18 — Body"] === 1 && seen["Text/11:16 — Caption"] === 1);
closePop();

/* colour picker → paint styles + colour tokens, across two groups and two collections */
ev(D.querySelector(".sec .prow .sw"), "click");
seen = report("paint styles+tokens", rows(), PAINT_STYLES.length + LOCAL_PAINT.length + 2 + 2);
expect("a style in both groups is listed once", seen["Colors/Text/Primary"] === 1);
expect("a token in two collections is listed once", seen["color/bg"] === 1);
expect("the rest of the library is intact",
  seen["Colors/Bg/Accent"] === 1 && seen["color/bg/subtle"] === 1);
/* the surviving row still applies something */
sent.length = 0;
ev([...D.querySelectorAll("#pop-layer .tok-row")].find(r => /Colors\/Text\/Primary/.test(r.textContent)), "click");
const applied = sent.find(m => m.key === "style.fill");
console.log("  apply ->", JSON.stringify(applied));
expect("the deduped style is still pickable", !!applied && !!applied.value);
/* the tie-break: of two rows nobody can tell apart, the one that keeps the link
   to the library is the one kept — the local P:9 is the stale copy */
expect("and it is the library entry that survived", !!applied && applied.value === "P:1");
closePop();

/* numeric field token picker — same token key from the scan and the catalogue */
ev(D.querySelector('[data-key="fontSize"] .tail .ib'), "click");
seen = report("float tokens", rows(), 3 + 1);
expect("the scanned token and its catalogue entry are one row", seen["g-spacing-4"] === 1);
expect("the other float token is still listed", seen["g-spacing-8"] === 1);
closePop();

/* Tokens tab — the same lists again, drawn as one block per collection */
ev([...D.querySelectorAll(".tab")].find(t=>t.textContent==="Tokens"), "click");
const tabRows = [...D.querySelectorAll(".tb-row .nm")].map(e=>e.textContent);
seen = report("tokens tab", tabRows, TOKENS.length + CATALOGUE.length + TEXT_STYLES.length +
  PAINT_STYLES.length + LOCAL_PAINT.length + LOCAL_TEXT.length);
expect("no token is repeated across collections", seen["bg"] === 1 && seen["g-spacing-4"] === 1);
expect("no style is repeated across local and library",
  seen["Colors/Text/Primary"] === 1 && seen["Text/Body 1"] === 1);

/* font picker */
ev([...D.querySelectorAll(".tab")].find(t=>t.textContent==="Design"), "click");
post({ type:"fonts", fonts:[{family:"Inter",styles:["Regular"]},{family:"Inter",styles:["Regular"]},{family:"Roboto",styles:["Regular"]}] });
ev(D.querySelector(".sec .fld.ref"), "click");
report("fonts", rows(), 3);
closePop();
check("pickers");

console.log("\nERRORS:", errors.length ? errors : "(none)");
