# Layers & Design — working notes

A Figma plugin that reproduces the native **Layers** and **Design** panels, so the
native ones can be collapsed and the plugin used in their place.

## Layout

| Path | What lives there |
| --- | --- |
| `plugin/manifest.json` | Plugin manifest. `documentAccess: dynamic-page`. |
| `plugin/code.js` | Main thread. Reads and writes the document, owns the design-system index. |
| `plugin/ui.html` | The entire panel — markup, CSS and script in one file. |
| `tests/` | Integrity checks and behavioural tests. `npm test`. |

Everything the plugin ships is under `plugin/`; everything that supports it is
under `tests/`. The four files left at the root have to be there: `package.json` and
`package-lock.json` for npm, `.gitignore` for git, and this file so Claude Code
loads it automatically.

No build step, on purpose. Figma loads `plugin/code.js` and `plugin/ui.html`
directly, so the files you edit are the files that ship. Do not introduce a bundler without a
reason that survives that trade-off.

## The two sides talk over postMessage

Nothing type-checks that conversation, so `tests/checks/protocol.js` walks both
files and fails when one side says something the other never listens for. Run it
after touching any message.

- Panel → plugin: `send({ type })`, routed by the `switch` in `handleMessage`.
- Property edits: `upd(key, value, index, extra, commit)` → `applyUpdate`.
  A few keys (`align`, `distribute`, `tidy`, `replaceColor`) act on the selection
  as a whole and are intercepted before the per-node loop.
- Plugin → panel: `figma.ui.postMessage({ type })`, handled in `onmessage`.

## Rules that came from real bugs

Each of these has a test named after it. Breaking one is a regression, not a
style preference.

1. **A node reference that survives an `await` may be dead.** For instance
   sublayers and table cells even reading `.removed` or `.children` throws. Go
   through `nodeAlive()` and `safeChildren()`. Anything running from a timer or a
   Figma event callback must also catch, because nothing above it does.
   → `tests/plugin/dead-node-resilience.js`

2. **Layer order depends on the parent.** Plain frames list children in z-order
   (last child first); auto-layout frames list them in layout order (first child
   first). Drag-and-drop index maths follows the same rule.
   → `tests/plugin/layer-order-and-reparenting.js`

3. **`e.currentTarget` is null once the event has dispatched.** Capture the
   element in a local before building a menu whose callbacks run later.
   → `tests/ui/popover-anchor-regression.js`

4. **A control that is invisible at rest must not reserve width.** Use
   `display: none`, never `opacity: 0`, or values get clipped.
   → `tests/ui/hidden-controls-reserve-no-width.js`

5. **`field()` returns different shapes.** With a bound variable it returns a
   token chip that has no `<input>`. Never reach into a field after building it;
   pass what you need through the options.
   → `tests/ui/padding-token-regression.js`

6. **Library entries dedupe by `key`, not `id`.** A file accumulates several
   local ids for one library style or variable. Every picker also runs through
   `dedupeStyles` / `dedupeTokens`.
   → `tests/ui/no-duplicate-styles.js`

7. **Never swallow a read failure silently.** Hardening `readProps` against dead
   nodes once turned every unreadable node into an empty panel with no clue why.
   Catch, keep going, but report — the panel has a copyable error bar for this.
   → `tests/plugin/unreadable-selection.js`

8. **`componentProperties` is unordered.** Take the order from the main
   component's `componentPropertyDefinitions`; fall back to the id in the
   property key, then a natural sort.
   → `tests/ui/component-property-order.js`

9. **A page's selection only accepts nodes from that page.** The trap is
   `getMainComponentAsync()`: it answers for a library instance too, but that
   node hangs off no page, so selecting it throws. Find the page first and bail
   out when there isn't one.
   → `tests/plugin/library-main-component.js`

## What the API cannot do

Do not spend time trying to work around these; say so in the UI instead.

- Library **styles** cannot be enumerated. They are harvested from what the
  document already uses (`scanDocument`). Library **variables** have a real
  catalogue via `figma.teamLibrary`, but only when the file subscribes to it.
- There is no viewport-change event, so the zoom readout refreshes on the next
  push rather than continuously.
- `figma.on("documentchange")` would force `loadAllPagesAsync()` and stall large
  files. Use `figma.currentPage.on("nodechange")`.
- A plain `LINE` exposes one stroke cap for both ends; only `VECTOR` (per vertex)
  and `CONNECTOR` (dedicated properties) have independent ends.
- Nothing opens another file, so "Go to main component" can only report that the
  component is in a library.
- No canvas hover events, no docking, no eyedropper, no library file name.

## Keeping the editor responsive

Figma runs the plugin on a thread the editor shares, so a busy loop there shows
up as stutter in the canvas. The background scan is built around that:

- each tick works for **6 ms**, then yields for **24 ms** — never `setTimeout(…, 0)`,
  which reschedules immediately and starves the editor;
- the first tick waits **1.5 s** so the panel paints and the first clicks land
  before the document tree is touched;
- a tick is skipped entirely while the document is changing, so the scan never
  competes with typing or dragging;
- `skipInvisibleInstanceChildren` is on for the duration of the walk;
- the team-library catalogue is a network round trip and is **not** fetched at
  startup — the saved index covers the first paint, the catalogue is requested
  when a picker asks for it.

Tests that depend on the scan have to outwait `SCAN_START_DELAY_MS`; see
`SCAN_WAIT` in the index tests.

## Conventions

- Icons: generic UI glyphs come from `@gravity-ui/icons` and are filled paths —
  `ic(path, true)`. Figma-specific glyphs (layer types, auto-layout flow,
  alignment, stroke caps) are hand-drawn strokes — `ic(path)` — because Gravity
  has no equivalent and a near-miss reads worse than a purpose-drawn one.
- Theme: dark by default and defined without reference to Figma's variables, so
  the panel does not read as part of Figma's chrome. `data-theme="auto"` hands
  the palette back to Figma. Sizing tokens live in their own `:root` rule so they
  survive either theme.
- Comments explain *why*. The what is already in the code.

## Before committing

```sh
npm test
```

37 files: 2 integrity checks, 8 main-thread tests, 27 panel tests. All must pass.

Assertions go through `expect(label, condition)` from either harness. A test that
prints numbers without asserting them can pass while measuring nothing — that
happened once already, when a timing change made an index test vacuous.
