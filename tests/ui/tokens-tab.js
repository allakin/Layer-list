const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function ev(el,type,init){ if(!el){errors.push("no el for "+type);return;} el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }
const STYLES = { type:"styles", paint:[{id:"S:loc1",key:"k0",name:"Local/Grey",type:"PAINT",remote:false,color:"#888888",desc:""}],
  text:[], effect:[], grid:[],
  library:{ paint:[{id:"S:lib1",key:"k1",name:"Colors/Text/Primary",type:"PAINT",remote:true,color:"#1A1A1A",desc:""}],
    text:[{id:"S:lib3",key:"k3",name:"Heading/H2",type:"TEXT",remote:true,color:null,desc:"Inter Bold · 24"}],
    effect:[{id:"S:lib4",key:"k4",name:"Elevation/2",type:"EFFECT",remote:true,color:null,desc:"2 effects"}],
    grid:[], scannedAll:false, truncated:true } };

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:[], rows:[] });
ev([...D.querySelectorAll(".tab")].find(t=>t.textContent==="Tokens"), "click");
post({ type:"variables", collections:[] });
post({ type:"libraryVariables", collections:[] });
post(STYLES);
console.log("style sections:", [...D.querySelectorAll(".tb-col-hd .t")].map(e=>e.textContent).join(" | "));
console.log("local/library markers:", [...D.querySelectorAll(".tb-col-hd .n")].map(e=>e.textContent).join(","));
console.log("rows:", [...D.querySelectorAll(".tb-row .nm")].map(e=>e.textContent).join(", "));
console.log("truncation warning shown:", [...D.querySelectorAll(".hint")].some(e=>/40 000/.test(e.textContent)));
sent.length=0;
ev(D.querySelector(".tb-row"), "click");
console.log("apply from tokens tab ->", JSON.stringify(sent.find(m=>m.type==="update")));
check("tokens styles");

/* search filters styles too */
const s = D.querySelector('#insp-body input');
s.value = "heading"; s.dispatchEvent(new w.Event("input",{bubbles:true}));
console.log("filtered rows:", [...D.querySelectorAll(".tb-row .nm")].map(e=>e.textContent).join(", "));
check("token search");
console.log("\nERRORS:", errors.length ? errors : "(none)");
