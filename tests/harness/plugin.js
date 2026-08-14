/* Minimal Figma API stub, enough to load code.js and drive it. */
const posted = [];
const clientStore = {};
const events = {};      // figma.on handlers
const pageEvents = {};  // page.on handlers
let uiHandler = null;
const nodesById = new Map();

function mkNode(o) {
  const n = o;                                  // register the real object, not a copy
  if (n.visible === undefined) n.visible = true;
  if (n.locked === undefined) n.locked = false;
  n.removed = false;
  if (n.type === "TEXT" && n.characters === undefined) n.characters = "text";
  if (n.children) {
    n.children.forEach(c => { c.parent = n; });
    n.insertChild = (i, child) => {
      if (child.parent && child.parent.children) {
        const arr = child.parent.children;
        const at = arr.indexOf(child);
        if (at > -1) arr.splice(at, 1);
      }
      n.children.splice(i, 0, child);
      child.parent = n;
    };
    n.appendChild = (child) => n.insertChild(n.children.length, child);
  }
  nodesById.set(n.id, n);
  (n.children || []).forEach(mkNode);
  return n;
}

global.figma = {
  mixed: Symbol("mixed"),
  skipInvisibleInstanceChildren: false,
  showUI() {},
  notify(m) { console.log("NOTIFY:", m); posted.push({ notify: m }); },
  commitUndo() {},
  clientStorage: { getAsync: async (k) => clientStore[k] === undefined ? null : clientStore[k], setAsync: async (k,v) => { clientStore[k] = JSON.parse(JSON.stringify(v)); } },
  ui: { postMessage: (m) => posted.push(m), resize() {}, set onmessage(fn) { uiHandler = fn; } },
  on(t, fn) { events[t] = fn; }, off() {},
  root: { children: [] },
  currentPage: null,
  viewport: { scrollAndZoomIntoView() {} },
  getNodeByIdAsync: async (id) => nodesById.get(id) || null,
  getStyleByIdAsync: async () => null,
  variables: {
    getLocalVariableCollectionsAsync: async () => [],
    getVariableByIdAsync: async () => null,
    getVariableCollectionByIdAsync: async () => null
  },
  teamLibrary: { getAvailableLibraryVariableCollectionsAsync: async () => [] },
  getLocalPaintStylesAsync: async () => [], getLocalTextStylesAsync: async () => [],
  getLocalEffectStylesAsync: async () => [], getLocalGridStylesAsync: async () => [],
  listAvailableFontsAsync: async () => [],
  setCurrentPageAsync: async () => {},
  loadFontAsync: async () => {}
};

global.__html__ = "<html></html>";
module.exports = { events, pageEvents, clientStore, posted, mkNode, nodesById, send: (m) => uiHandler(m), get ui() { return uiHandler; } };
