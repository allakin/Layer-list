/* Property order, against the user's "List" component. */
const { w, errors, post, check } = require("../harness/ui.js");
const D = w.document;

/* the order Figma's panel shows */
const FIGMA = ["Type","Top panel","Bottom pannel","Scroll",
  "Item 1","Item 2","Item 3","Item 4","Item 5","Item 6","Item 7","Item 8","Item 9","Item 10"];

/* the component declares them in that order... */
const DEFS = ["Type#1:0","Top panel#2:0","Bottom pannel#2:1","Scroll#2:2",
  "Item 1#2:3","Item 2#2:4","Item 3#2:5","Item 4#2:6","Item 5#2:7",
  "Item 6#2:8","Item 7#2:9","Item 8#2:10","Item 9#2:11","Item 10#2:12"];

/* ...but the instance hands them over scrambled, exactly as observed */
const SCRAMBLED = ["Item 10#2:12","Item 7#2:9","Item 6#2:8","Item 9#2:11","Item 5#2:7",
  "Item 2#2:4","Scroll#2:2","Top panel#2:0","Item 1#2:3","Item 8#2:10",
  "Item 3#2:5","Item 4#2:6","Bottom pannel#2:1","Type#1:0"];

function propsFor(keys) {
  return keys.map(function (k) {
    const label = k.split("#")[0];
    return label === "Type"
      ? { key:k, label:label, type:"VARIANT", value:"Basic", options:["Basic","Compact"] }
      : { key:k, label:label, type:"BOOLEAN", value: label === "Item 1", options:null };
  });
}

function render(order) {
  post({ type:"props", count:1, inspected:1, ids:["l"], types:["INSTANCE"], refs:{},
    props:{ id:"l", name:"List", type:"INSTANCE", visible:true, locked:false,
      x:0,y:0,width:300,height:400,rotation:0,
      constraints:{horizontal:"MIN",vertical:"MIN"}, inAutoLayout:false,
      layoutSizingHorizontal:null,layoutSizingVertical:null,layoutPositioning:null,
      opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
      strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null},
      effects:[], effectStyleId:"", exportSettings:[], boundVariables:{}, childCount:3,
      propertyOrder: order,
      mainComponent:{ id:"c1", name:"Type=Basic", setName:"List", title:"List", remote:true, missing:false,
        description:"List is a container component that wraps many List—item components inside itself" },
      instance:{ exposed:0, properties: propsFor(SCRAMBLED) } }});
  return [...D.querySelectorAll("#insp-body .prop .plabel")].map(e => e.textContent);
}

post({ type:"pages", pages:[{id:"0:1",name:"P"}], currentPageId:"0:1" });
post({ type:"layers", pageName:"P", truncated:false, searching:false, selection:["l"], zoom:1.7,
  rows:[{id:"l",name:"List",type:"INSTANCE",depth:0,parentId:"0:1",visible:true,locked:false,hasChildren:true,expanded:false,inComponent:true}]});

const withDefs = render(DEFS);
check("with definition order");
console.log("API order (scrambled):");
console.log("  " + SCRAMBLED.map(k=>k.split("#")[0]).join(", "));
console.log("\nplugin, using componentPropertyDefinitions:");
console.log("  " + withDefs.join(", "));
console.log("  matches Figma:", JSON.stringify(withDefs) === JSON.stringify(FIGMA));

const fallback = render(null);
check("fallback order");
console.log("\nplugin, fallback (no definition list available):");
console.log("  " + fallback.join(", "));
console.log("  matches Figma:", JSON.stringify(fallback) === JSON.stringify(FIGMA));

/* last resort: opaque keys, so only the label is left to sort by */
const OPAQUE = ["Item 10","Item 2","Type","Item 1","Scroll","Item 20","Item 3"].map(function (label) {
  return label === "Type"
    ? { key: label, label: label, type: "VARIANT", value: "Basic", options: ["Basic"] }
    : { key: label, label: label, type: "BOOLEAN", value: false, options: null };
});
post({ type:"props", count:1, inspected:1, ids:["l"], types:["INSTANCE"], refs:{},
  props:{ id:"l", name:"List", type:"INSTANCE", visible:true, locked:false,
    x:0,y:0,width:300,height:400,rotation:0,
    constraints:{horizontal:"MIN",vertical:"MIN"}, inAutoLayout:false,
    layoutSizingHorizontal:null,layoutSizingVertical:null,layoutPositioning:null,
    opacity:1, blendMode:"PASS_THROUGH", fills:[], fillStyleId:"", strokes:[], strokeStyleId:"",
    strokeWeight:0, strokeAlign:"INSIDE", dashPattern:"", strokeSides:{top:null},
    effects:[], effectStyleId:"", exportSettings:[], boundVariables:{}, childCount:3,
    propertyOrder:null,
    mainComponent:{ id:"c1", name:"Type=Basic", setName:"List", title:"List", remote:true, missing:false, description:"" },
    instance:{ exposed:0, properties: OPAQUE } }});
check("opaque keys");
console.log("\nplugin, opaque keys (natural sort on labels):");
console.log("  " + [...D.querySelectorAll("#insp-body .prop .plabel")].map(e=>e.textContent).join(", "));

console.log("\nERRORS:", errors.length ? errors : "(none)");
