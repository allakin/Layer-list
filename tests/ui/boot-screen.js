/*
 * Reading a large page is not instant, so the panel opens on a loading screen
 * that reports what it is doing and gets out of the way once the structure has
 * arrived. It must never be able to trap the user.
 */
const { w, errors, post, check } = require("../harness/ui.js");
const D = w.document;
const boot = () => D.getElementById("boot");

// The `ready` message goes out while the document is still being constructed,
// before the harness can intercept postMessage, so it is not asserted here.
console.log("visible on open:      ", !boot().classList.contains("gone"));
console.log("first step:           ", JSON.stringify(D.getElementById("boot-step").textContent));

/* the main thread narrates each phase */
post({ type: "boot", step: "Reading the page structure…", detail: "В работе" });
console.log("\nstep:                 ", JSON.stringify(D.getElementById("boot-step").textContent));
console.log("detail (page name):   ", JSON.stringify(D.getElementById("boot-hint").textContent));

post({ type: "boot", step: "Restoring the design-system index…" });
console.log("step:                 ", JSON.stringify(D.getElementById("boot-step").textContent));
console.log("still covering:       ", !boot().classList.contains("gone"));

/* the layer push means the structure has been read */
post({ type: "pages", pages: [{ id: "0:1", name: "P" }], currentPageId: "0:1" });
post({ type: "layers", pageName: "P", truncated: false, searching: false, selection: [], zoom: 1,
  rows: [{ id: "a", name: "Frame", type: "FRAME", depth: 0, parentId: "0:1",
    visible: true, locked: false, hasChildren: false, expanded: false, inComponent: false }] });
console.log("\nhidden after layers:  ", boot().classList.contains("gone"));
check("boot");

/* late boot messages must not bring it back */
post({ type: "boot", step: "Something later" });
console.log("stays hidden:         ", boot().classList.contains("gone"));

/* and there is a timeout so a stalled step cannot trap anyone */
const script = require("fs").readFileSync(
  require("path").join(__dirname, "..", "..", "plugin", "ui.html"), "utf8");
console.log("has a safety timeout: ", /setTimeout\(bootDone, \d+\)/.test(script));

console.log("\nERRORS:", errors.length ? errors : "(none)");
