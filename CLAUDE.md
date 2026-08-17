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

The panel holds three panes — **Layers**, **Design** and **Scale** — each of which
can be switched off, arranged as three columns, three rows, or Layers and Design
sharing a line with Scale across the bottom. The arrangement, which panes are on,
the size each divider was dragged to and the scale anchor all live in
`clientStorage` with the window's own size and position.

Everything the plugin ships is under `plugin/`; everything that supports it is
under `tests/`. What is left at the root is there because it has to be:
`package.json` and `package-lock.json` for npm, `.gitignore` and `.gitattributes`
for git, `README.md` and `LICENSE` for anyone arriving at the repository, and this
file so Claude Code loads it automatically.

The test count appears in three of them and goes stale silently: this file
(*Before committing*), `README.md` (the badge **and** the `npm test` comment) and
`.claude/skills/verify/SKILL.md`. Change the number in all three or in none.

No build step, on purpose. Figma loads `plugin/code.js` and `plugin/ui.html`
directly, so the files you edit are the files that ship. Do not introduce a bundler without a
reason that survives that trade-off.

## The two sides talk over postMessage

Nothing type-checks that conversation, so `tests/checks/protocol.js` walks both
files and fails when one side says something the other never listens for. Run it
after touching any message.

- Panel → plugin: `send({ type })`, routed by the `switch` in `handleMessage`.
- Property edits: `upd(key, value, index, extra, commit)` → `applyUpdate`.
  A few keys (`align`, `distribute`, `tidy`, `replaceColor`, `scale`) act on the
  selection as a whole and are intercepted before the per-node loop — and
  `tests/checks/protocol.js` keeps its own list of them, so add new ones there too.
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

   It also commits **once** per entry, and that took work: Enter commits and then
   blurs, blur commits too, and restoring a rejected value is one more thing the
   blur would commit as though it had been typed. Invisible for every value that
   is *assigned* — an opacity of 50 set twice is still 50 — and wrong for one that
   is *applied*: a Scale of 2x arrived twice and scaled by 4. Anything relative
   goes through `field()` rather than around it.
   → `tests/ui/scale-panel.js`

   A held arrow key is a **live** step, committed once on `keyup`, exactly like a
   scrub. One commit per repeat meant one undo step, one document write and one
   `props` push per repeat — and each push rebuilt the field from a value two or
   three presses old, so the number bounced and could not be brought to rest. The
   other half of that: a field with the focus keeps its own text through a rebuild.
   It belongs to whoever is typing in it until they leave it, which is the same
   rule the colour picker's own fields follow.
   → `tests/ui/arrow-stepping.js`

6. **Library entries dedupe by `key`, not `id`.** A file accumulates several
   local ids for one library style or variable. Every picker also runs through
   `dedupeStyles` / `dedupeTokens` — and a picker's list is *one* list even when
   it is drawn as several groups, so one `newSeen()` has to span all of them.
   Local and library styles, and one block per collection, are headings, not
   separate lists; restarting the dedupe at each heading brings the duplicate
   straight back. When two entries are indistinguishable the library one wins:
   it is the half that keeps the link.
   → `tests/ui/no-duplicate-styles.js`

   And a library entry is *applied* by key too, never by the id the index
   remembers: that id is a local instance of the library's style, which Figma
   drops once nothing in the file uses it — while the index outlives the session in
   `clientStorage`. Applying the remembered id then fails with `Cannot set style
   successfully: Cannot find style`. `setStyle()` imports by key first, the way
   `resolveVariableForBinding()` always has for tokens.
   → `tests/plugin/library-style-apply.js`

7. **Never swallow a read failure silently.** Hardening `readProps` against dead
   nodes once turned every unreadable node into an empty panel with no clue why.
   Catch, keep going, but report — the panel has a copyable error bar for this.
   → `tests/plugin/unreadable-selection.js`

   And report something *readable*: the sandbox throws strings and bare objects as
   well as Errors, so `e.message` produced the toast `Frame 2087328884: undefined`,
   which names neither the cause nor anywhere to look. Everything user-facing goes
   through `errText()`.
   → `tests/plugin/style-backed-paint.js`

8. **`componentProperties` is unordered.** Take the order from the main
   component's `componentPropertyDefinitions`; fall back to the id in the
   property key, then a natural sort.
   → `tests/ui/component-property-order.js`

9. **Nothing on the selection path may read a whole subtree.** It runs on the
   editor's thread, for up to `MAX_INSPECT` nodes, on every pointer move of a
   marquee. Coalesce the pushes and give every walk a budget.
   → `tests/plugin/selection-cost.js`

10. **A layer can contain itself.** Slot content and recursive instances put the
    same id inside its own subtree. Every walk over `children` needs the path it
    came by; without it the tree runs to `MAX_ROWS` a thousand levels deep, and a
    deep expand blows the stack. `.lrow` is as wide as its content, so a pane next
    to it must never take its width from what it holds.
    → `tests/plugin/self-nesting-layer.js`, `tests/ui/deep-rows-keep-inspector.js`

11. **A text layer's name and its text are two different strings.** Figma keeps
    them in step only until one of them is edited, so a layer called `Label` can
    say "Sign in" — searching names alone never finds it, and renaming it never
    changes what is on the canvas. Anything offering to rewrite text has to say
    which of the two it writes, and `.characters` needs every font in the node
    loaded first (one per styled run, so `getStyledTextSegments` when `fontName`
    is mixed).
    → `tests/plugin/rename-found-layers.js`, `tests/ui/rename-found-layers.js`

12. **A page's selection only accepts nodes from that page.** The trap is
    `getMainComponentAsync()`: it answers for a library instance too, but that
    node hangs off no page, so selecting it throws. Find the page first and bail
    out when there isn't one.
    → `tests/plugin/library-main-component.js`

13. **A pointer capture belongs to something no repaint replaces.**
    `setPointerCapture` on an element that has left the document throws
    `InvalidStateError`, and pressing a thing usually selects it, which usually
    repaints it. Capture on the container — the gradient ramp, not the handle in
    it — and for the same reason wire the container's listeners once at build
    time, never from the painter, or every repaint adds another.
    → `tests/ui/gradient-editing.js`

14. **Gradient stops live in position order.** Figma reads `gradientStops` in
    array order, so a stop dragged past its neighbour has to change places with
    it. Both sides sort, and the index travels with the edit that caused the
    sort, so the panel has to follow the stop rather than the slot it was in.
    Every operation moves stop *objects*: rebuilt from colours, they lose the
    variable bound to them. `gradientTransform` is a 2x3 matrix mapping the unit
    square into the space the ramp runs across, so its **first row** is the
    direction the ramp runs — reading the first column transposes it.
    → `tests/plugin/gradient-stops.js`, `tests/ui/gradient-editing.js`

15. **The panel's own window is restored before it is shown.** Size and position
    come out of `clientStorage`, which is asynchronous, so the window is created
    with `visible: false` and `show()` only after both are applied — shown first,
    it paints once at the default size and place and then jumps. `show()` runs
    whatever the read did, because storage that will not answer must cost the
    placement and never the panel. `reposition()` takes **canvas** coordinates
    while what the user arranged is a place on **screen**: save window space and
    convert through one `getPosition()`, which answers in both spaces for the
    same point, or the window moves itself in every file at a different zoom.
    → `tests/plugin/window-placement.js`

16. **The arrangement is one DOM in three shapes.** `#row-top` is
    `display: contents` unless the layout wants Layers and Design on one line, so
    nothing is moved between arrangements — but `display: contents` takes the
    wrapper out of the *layout*, never out of the *DOM*, so a selector still has
    to reach the panes through it (`#main.rows #layers-pane`, not `>`). Which pane
    takes the slack cannot be CSS alone, because it depends on what is switched
    on: `applyLayout()` writes that, the divider axes and the visibility, and it
    is the only place that does. A divider sizes the pane *after* it, on whichever
    axis the arrangement puts it, and each arrangement keeps its own sizes — a
    width in one is a height in another.
    → `tests/ui/panel-layout.js`

17. **Scaling is `rescale()`, and nothing else scales.** `resize()` changes the
    box; `rescale()` is the Scale tool — strokes, corner radii and font sizes go
    with the geometry. It takes one uniform factor of at least 0.01 and holds the
    node's **origin** still, which is the translation in its absolute transform,
    not the corner of its bounding box. Any other anchor is a move afterwards, and
    `x`/`y` are measured inside the parent, so an absolute move has to be
    converted through the inverse of the parent's transform first. Skip a layer
    whose parent is auto layout (it does not own its position) and a layer inside
    another selected layer (it is already being scaled by it). No control on that
    panel may scrub: every commit changes the size the next one is measured
    against, so a live drag compounds. The multiplier shows the factor last
    applied and stays there — snapping back to `1x` read as the panel having
    ignored the number that was just typed.
    → `tests/plugin/scale-selection.js`, `tests/ui/scale-panel.js`

18. **A paint style is a link, and the paint array is what it links to.** Writing
    `fills` while `fillStyleId` holds throws, and under `dynamic-page` that id is
    read-only — the only way to let go is `setFillStyleIdAsync("")`. So every key
    named `fill.*` or `stroke.*` (the dot is what tells them apart from
    `strokeWeight` and friends, and from `style.fill`) detaches first, and says so
    once the edit is committed rather than on every frame of a drag. Cutting a
    layer loose from the design system is not something to do quietly.
    → `tests/plugin/style-backed-paint.js`

19. **`x`, `y`, `width` and `height` describe a layer before it is rotated.** One
    turned 90° reports 85 wide where 16 is what you see, and its `x` is the corner
    the rotation turns around, which need not be any edge of the box on screen.
    "Centre horizontally" computed from those numbers put such a layer at
    `(70 - 85) / 2 = -7.5` inside a 70-wide frame — outside it — while Figma's own
    panel centred it correctly. Everything that positions by numbers goes through
    `parentBox()` / `absoluteBox()` and moves by a **delta**, never by assigning a
    coordinate. Which space to work in is `positioner()`'s decision: the parent's,
    because that is where `x` and `y` live and it is the only way a rotated
    *parent* comes out right — falling back to the canvas only when the selection
    spans several parents, since two parents share no other origin. Measure every
    box before the first move; half a rearranged layout answers differently.
    → `tests/plugin/align-rotated-and-nested.js`

## What the API cannot do

Do not spend time trying to work around these; say so in the UI instead.

- There is **no filesystem**. The main thread is a sandbox with no `fs`, and the
  panel is a null-origin iframe where even `localStorage` is unavailable. Nothing
  the plugin can do puts a settings file in the project folder — the only route to
  disk is a download the user clicks. `figma.clientStorage` is the local store:
  per user, per device, never synced, outside the document, 5 MB, and reachable
  only from the main thread (the panel goes through `postMessage`). There is
  nothing for `.gitignore` to cover, because there is no file.
- Nothing fires when the user moves or resizes the plugin window, so the position
  is polled (see below) and the size arrives as a `resize` message from the grip.
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

### When the plugin will not open at all

Read the stack before reading the code. An error whose frames are all in
`figma_app-*.min.js` / `vendor-core-*.min.js`, with a failed request for
`static.figma.com/…/jsvm-cpp.js.br` above it, is Figma failing to download its own
plugin VM:

```
Failed to load resource: net::ERR_TIMED_OUT   static.figma.com/…/jsvm-cpp.js.br
ec: An error occurred while loading the plugin environment
```

`code.js` never ran — that VM is what would have run it. Nothing in this repo can
cause or fix it: reload, then look at VPN, proxy, content blockers and DNS, and
check whether any other plugin opens. Ours would name its own file and line
instead. What is on us is that opening the panel never waits on a request of its
own, and that the window is asked for before the first `await` — both pinned.
→ `tests/checks/protocol.js`, `tests/plugin/window-placement.js`

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

Selection is the other hot path, because a marquee fires `selectionchange` on
every pointer move and each one used to do all of the work at once:

- the handler only sets a flag and calls `scheduleRefresh`, so a burst costs one
  reveal, one layer push and one property read (**90 ms** window);
- the token harvest goes through `queueNodeIndex`, the same **400 ms** debounce
  the edits use, and is deduped by id — a drag reports the same nodes repeatedly;
- both subtree walks are capped: `COLOR_SAMPLE_NODES` for the colour strip
  (breadth-first, so a big selection is still covered) and
  `INDEX_SAMPLE_NODES` for the index, where every id found costs a lookup.
  Neither needs to be exhaustive — the background scan is the thorough one.

The window position is the one thing here that is polled, because no event
reports it (`POS_POLL_MS`, **1 s**). That is affordable only because
`figma.ui.getPosition()` reads no node and walks nothing; the poll stops the
moment it throws, rather than waking up for a plugin that has closed. What costs
is the write, so both it and the resize grip go through `saveLater` — one
`clientStorage` write per key, **400 ms** after things stop moving, instead of one
per pointer move.

Tests that depend on the scan have to outwait `SCAN_START_DELAY_MS` (see
`SCAN_WAIT` in the index tests); tests that fire `selectionchange` have to
outwait the 90 ms window (see `SETTLE` in `unreadable-selection.js`); tests that
watch the window position have to outwait `POS_POLL_MS` plus the save debounce.

## Conventions

- Icons: generic UI glyphs come from `@gravity-ui/icons` and are filled paths —
  `ic(path, true)`. Figma-specific glyphs (layer types, auto-layout flow,
  alignment, stroke caps) are hand-drawn strokes — `ic(path)` — because Gravity
  has no equivalent and a near-miss reads worse than a purpose-drawn one.
- Every library-backed picker opens with its `.psearch` field focused: a file's
  styles and tokens are reached by typing, not by scrolling. Go through
  `focusPickerSearch()`, never `querySelector("input")` — in the colour picker
  that is the hex field.
  → `tests/ui/picker-search-focus.js`
- The colour picker is two columns — the palette left, the file's styles and
  tokens right — and stacks below `CP_TWO_COL_MIN` (420 px), because the panel
  itself goes down to 260. The palette stays first in the DOM whichever way they
  sit: the hex field has to remain the picker's first `<input>`. That is also why
  the gradient ramp and its stop rows sit *below* the hex field rather than
  directly under the type dropdown where Figma draws them — those rows are inputs
  too.
  → `tests/ui/colour-picker-columns.js`, `tests/ui/gradient-editing.js`
- Theme: dark by default and defined without reference to Figma's variables, so
  the panel does not read as part of Figma's chrome. `data-theme="auto"` hands
  the palette back to Figma. Sizing tokens live in their own `:root` rule so they
  survive either theme.
- Comments explain *why*. The what is already in the code.

## Before committing

```sh
npm test
```

54 files: 2 integrity checks, 17 main-thread tests, 35 panel tests. All must pass.

Assertions go through `expect(label, condition)` from either harness. A test that
prints numbers without asserting them can pass while measuring nothing — that
happened once already, when a timing change made an index test vacuous.
