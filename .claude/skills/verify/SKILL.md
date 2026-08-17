---
name: verify
description: Check the plugin's integrity — syntax, the postMessage protocol between ui.html and code.js, and the full behavioural suite. Use before committing, after any edit to code.js or ui.html, or when the user asks to "проверить", "check the plugin", "run the tests", "всё ли цело".
---

# Verify the plugin

Run everything:

```sh
npm test
```

54 files must pass: 2 integrity checks, 17 main-thread tests, 35 panel tests.

## Narrow it down

```sh
npm run test:checks         # syntax + protocol only — fastest, run this first
npm run test:ui             # the panel in jsdom
npm run test:plugin         # the main thread against a stubbed Figma API
node tests/run.js theme     # any file whose name contains "theme"
```

The runner prints one line per file and dumps the full output of failures at the
end. It exits non-zero if anything fails.

## Reading a failure

A test can fail two ways, and the runner catches both:

- **non-zero exit** — the file threw before finishing;
- **clean exit but a bad report** — the harnesses collect exceptions instead of
  crashing, so `ERRORS: [...]`, `plugin error toasts: [...]`,
  `notifications: [...]` or `FAIL:` in the output all count as failures.

That second case is the common one. It usually means the panel threw inside an
event handler, which in Figma would show as the red bar in the plugin, or the
main thread threw, which would show as an orange Figma toast.

## What the checks cover

`tests/checks/syntax.js`
: Parses `code.js` and the script inside `ui.html` — a syntax error in the inline
  script is otherwise invisible until you open the plugin. Also validates
  `manifest.json` and that the files it names exist.

`tests/checks/protocol.js`
: Walks both sides of the postMessage conversation and fails when one says
  something the other never listens for: every `upd("key")` has a case in
  `applyUpdate`, every `send({type})` is routed, every `postMessage({type})` is
  received. Then two things about the files themselves: no machine-specific path
  leaked into either, and neither reaches for the network — opening the panel must
  never wait on a request. Keys that act on the whole selection (`align`,
  `distribute`, `tidy`, `replaceColor`, `scale`) are listed in this file too, so a
  new one has to be added here as well.

## If you changed the protocol

Run `npm run test:checks` first. A control that silently does nothing is almost
always a missing case on the other side, and this check names it directly.
