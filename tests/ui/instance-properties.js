/* Instance panel modelled on the user's Figma screenshot (YC Gravity UI Button). */
const { w, errors, sent, post, check } = require("../harness/ui.js");
const D = w.document;
function ev(el,type,init){ if(!el){errors.push("no el for "+type);return;} el.dispatchEvent(new w.MouseEvent(type,Object.assign({bubbles:true,cancelable:true},init))); }

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["btn"], zoom:1.26,
  rows:[{id:"btn",name:"Button",type:"INSTANCE",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:false,inComponent:true}]});

post({ type:"props", count:1, inspected:1, ids:["btn"], types:["INSTANCE"],
  refs:{ "swap:4001:370":  { kind:"component", id:"4001:370",  name:"Icons / rectangle-check", short:"rectangle-check", set:"Icons", remote:true },
         "swap:4001:1384": { kind:"component", id:"4001:1384", name:"Icons / arrow-right",     short:"arrow-right",     set:"Icons", remote:true } },
  props:{ id:"btn", name:"Button", type:"INSTANCE", visible:true, locked:false,
    x:84, y:0, width:120, height:28, rotation:0,
    constraints:{horizontal:"MIN",vertical:"MIN"}, inAutoLayout:true, layoutPositioning:"AUTO",
    layoutSizingHorizontal:"HUG", layoutSizingVertical:"HUG",
    minWidth:null,maxWidth:null,minHeight:null,maxHeight:null,
    opacity:1, blendMode:"PASS_THROUGH",
    fills:[], fillStyleId:"", strokes:[], strokeStyleId:"", strokeWeight:0, strokeAlign:"INSIDE",
    dashPattern:"", strokeSides:{top:null}, effects:[], effectStyleId:"", exportSettings:[],
    boundVariables:{}, childCount:2,
    mainComponent:{ id:"4001:1", name:"View=Normal, Size=S", setName:"Button",
      title:"Button", remote:true, missing:false,
      description:"A button is an interactive element of the user interface that, when clicked, performs a predefined action." },
    instance:{ exposed:1, properties:[
      { key:"View#1:0",       label:"View",       type:"VARIANT",        value:"Normal",  options:["Normal","Action","Outlined","Flat"] },
      { key:"Size#1:1",       label:"Size",       type:"VARIANT",        value:"S",       options:["XS","S","M","L","XL"] },
      { key:"State#1:2",      label:"State",      type:"VARIANT",        value:"Default", options:["Default","Hovered","Pressed","Disabled"] },
      { key:"Icon only#2:0",  label:"Icon only",  type:"BOOLEAN",        value:false,     options:null },
      { key:"Start icon#2:1", label:"Start icon", type:"BOOLEAN",        value:true,      options:null },
      { key:"Content#3:0",    label:"Content",    type:"TEXT",           value:"Перейти в Метрики", options:null },
      { key:"End icon#2:2",   label:"End icon",   type:"BOOLEAN",        value:false,     options:null },
      { key:"Start icon#4:0", label:"Start icon", type:"INSTANCE_SWAP",  value:"4001:370",  options:null, ref:"swap:4001:370" },
      { key:"End icon#4:1",   label:"End icon",   type:"INSTANCE_SWAP",  value:"4001:1384", options:null, ref:"swap:4001:1384" }
    ]} }});
check("render");

const sec = D.querySelector("#insp-body .sec .comp-head").closest(".sec");
console.log("TITLE:", sec.querySelector(".comp-head .t").textContent);
console.log("SUBLINE:", (sec.querySelector(".comp-sub .n")||{}).textContent);
console.log("DESC:", (sec.querySelector(".comp-desc")||{textContent:""}).textContent.slice(0,52) + "…");
console.log("HEADER ICONS:", [...sec.querySelectorAll(".r .ib")].map(b=>b.title).join(" | "));
console.log("");
[...sec.querySelectorAll(".prop")].forEach(p => {
  const label = p.querySelector(".plabel").textContent;
  const ctl = p.querySelector(".pctl").firstElementChild;
  var kind = ctl.classList.contains("tgl") ? ("toggle " + (ctl.classList.contains("on") ? "ON " : "off"))
    : ctl.classList.contains("sel") ? ("dropdown <" + ctl.querySelector(".v").textContent + ">")
    : ("input [" + ctl.querySelector("input").value + "]");
  console.log("  " + label.padEnd(16), kind);
});

/* toggling a boolean */
sent.length=0;
ev([...sec.querySelectorAll(".prop")].find(p=>/^Icon only/.test(p.textContent)).querySelector(".tgl"), "click");
console.log("\ntoggle 'Icon only' ->", JSON.stringify(sent.find(m=>m.key==="instanceProp")));

/* swap dropdown resolves names and loads candidates */
const swapRow = [...sec.querySelectorAll(".prop.nested")][0];
console.log("swap row shows name:", JSON.stringify(swapRow.querySelector(".sel .v").textContent));
sent.length=0;
ev(swapRow.querySelector(".sel"), "click");
console.log("requested:", JSON.stringify(sent.find(m=>m.type==="getSwapOptions")));
post({ type:"swapOptions", propKey:"Start icon#4:0",
  preferred:[{id:"4001:370",name:"rectangle-check",set:"Icons"},{id:"4001:371",name:"circle-check",set:"Icons"}],
  local:[{id:"9:9",name:"My Icon",set:null}] });
console.log("options:", [...D.querySelectorAll("#pop-layer .mgroup")].map(e=>e.textContent).join(" | "),
            "->", [...D.querySelectorAll("#pop-layer .tok-row .nm")].map(e=>e.textContent).join(", "));
sent.length=0;
ev([...D.querySelectorAll("#pop-layer .tok-row")][1], "click");
console.log("pick ->", JSON.stringify(sent.find(m=>m.key==="instanceProp")));
check("swap");

/* whole-instance swap from the header */
ev([...sec.querySelectorAll(".r .ib")].find(b=>b.title==="Swap instance"), "click");
post({ type:"swapOptions", propKey:null, preferred:[], local:[{id:"7:7",name:"Link Button",set:"Button"}] });
sent.length=0;
ev(D.querySelector("#pop-layer .tok-row"), "click");
console.log("swap instance ->", JSON.stringify(sent.find(m=>m.type==="swapInstance")));
check("instance swap");

console.log("\nERRORS:", errors.length ? errors : "(none)");
