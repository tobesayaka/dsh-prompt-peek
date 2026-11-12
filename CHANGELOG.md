# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed

- **`Ctrl+R` and `↑` only saw the page the Host had buffered.** A session opens
  on one page of messages, and older turns are loaded only when the transcript
  asks for them, so a long thread showed three or four prompts no matter what
  "History limit" said — scrolling "discover earlier" in the chat first made
  them appear. Both entry points now pull older pages through the Session's
  public `loadOlder()` until the window holds the configured number of prompts
  (300 by default), stopping at the limit or when the Host reports no older
  history. The panel count and the history pill show "Loading earlier
  prompts…" while pages arrive; nothing is written to disk and the session log
  is still never read directly.

## 0.3.4 - 2026-11-11

### Fixed

- **Interface language never followed DSH.** Under `auto`, the panel asked the
  locale service for a translation and then treated *any* echo of the key as
  "host has no dictionary", so a Chinese interface always fell back to the
  built-in English copy; only a pinned `中文` looked translated. Language is now
  resolved from DSH's active locale (`zh`, `zh-CN`, …) on every call, the host
  dictionary is preferred when it has an entry, and the built-in table for the
  active language is the fallback. The Settings page and its sidebar row follow
  the same rule.
- **`PgUp` / `PgDn` appeared to do nothing.** The key was only handled while the
  reply preview was already visible; otherwise it reached the chat viewport and
  scrolled the transcript behind the panel, and presses from the preview itself
  or from history browsing were not handled at all. Now:
  - the first press opens the preview (if enabled in Settings) and pages it;
  - at the preview's top or bottom edge the press moves the selection to the
    previous or next prompt instead of silently stopping;
  - a press that finds nothing to scroll (a short reply) also steps the
    selection, and a discrete press always starts from where the preview is, so
    it cannot inherit a half-finished glide;
  - with previews off in Settings, or with a modifier held, the key keeps its
    native meaning.
- **`PgUp` scrolled the preview *down*, slowly, and nothing stopped it.**
  Since 0.3.3 the glide computed its per-frame step with
  `remaining > 0 ? Math.floor(advance) : Math.ceil(advance)` while `remaining`
  was already signed: going up, `advance` was `-1`-ish, `Math.ceil(-0.99)` is
  `0`, and the surrounding `Math.max(1, …)` turned it into **+1**. Every frame
  then moved the preview one pixel *down*, and PgDn only masked it because its
  steps were large. The step is now a whole pixel count in the travel's own
  sign (`glideStep`), so an upward glide can never be inverted.
- **`PgUp` during a `PgDn` glide kept going down.** The first fix sized each
  press from where the *previous* glide was heading, so a press while a glide
  was in flight could resolve to a target behind the current position: the
  preview then drifted further down and nothing cancelled it until it reached
  that stale target. Every press now starts from the live `scrollTop`, a press
  against the running direction turns the glide around, a key repeat only keeps
  one page of lead, and releasing `PgUp` / `PgDn` after a held key stops it.

### Added

- `docs/REGRESSIONS.md`: an archive of the bugs this release fixed (language
  follow, `PgUp` / `PgDn` doing nothing, the inverted glide step), with the
  commit each one entered, the reverse check that proves its tests fail on the
  old code, and the lesson that prevents a repeat.
- `test/client.test.mjs`: the client's translation, key-routing, and glide
  decision tables run without a browser, including a frame-by-frame simulation
  of a `PgUp` pressed while a `PgDn` glide is still in flight, and of the
  signed per-frame step that inverted it (25 tests in total with the Host
  suite).

## 0.3.3 - 2026-11-11

### Fixed

- `PgUp` and `PgDn` could move different distances from the same position.
  The glide used a sub-pixel step that the browser rounded to the same
  `scrollTop`, so it marked itself finished while the last pixel was still
  pending; the next press whichever direction started from that half-finished
  position. The glide now applies whole pixels in its travel's sign and only
  finishes once the target is actually reached.

### Changed

- The default page distance is **270 px**, about fifteen preview lines
  (the setting still stores pixels: 60–1200).

## 0.3.2 - 2026-11-11

### Fixed

- `PgUp` / `PgDn` and the setting disagreed about distance. The setting was
  labelled "lines per page" but scrolled a pixel value, a discrete press
  queued onto a running glide (so a second press moved further than set), a
  wheel notch moved a variable pixel amount for `deltaY: 100`, and the slider
  range (40–600) sat below the default (180 px ≈ 10 lines at 18 px).
  - The option is now **Page distance**, measured in pixels: 180 px by
    default, adjustable 60–1200 (the Host bounds match).
  - Every `PgUp` / `PgDn` moves exactly that distance from where the preview
    is now; a held key keeps at most one page of lead, it no longer compounds.
  - One wheel notch moves exactly a quarter page.

## 0.3.1 - 2026-11-11

### Fixed

- **"No text reply is available" on prompts that clearly had one.** History and
  the reply preview walked the event window with two different filters, so any
  event between a prompt and its answer (an edit, a surface replacement, a tool
  call) could hide the answer from the preview. Both now read one shared scan:
  a human message is any `user/message` with `source.kind === 'user'`, an
  assistant message is any event carrying `data.message.content` text, and
  everything else stays in place. A prompt's own text also doubles as the key,
  so a snapshot rebuilt between listing and previewing still matches.
- **No preview after pressing Space.** The preview column only rendered when a
  search hit was located; a prompt without a query produced "no text reply"
  instead of the tail of the answer. The preview now renders whenever the
  answer text exists, and a long answer is scrolled to the paragraph holding
  the first search hit (measured against the scroller, so page scrolling no
  longer skews it).
- Turning "Show reply preview" back on from the search panel (see 0.3.0).

## 0.3.0 - 2026-11-11

### Added

- **A Settings section of its own.** The plugin registers a top-level
  section in Settings — a sidebar row named *Prompt peek* between *Shell* and
  *Built-in plugins*, with a globe icon — instead of a tab inside *Built-in
  plugins*. It edits interface language (follow DSH / 中文 / English, a globe
  menu that applies on choice), reply preview on or off, smooth paging, lines
  per page, history limit, and result order; behavior changes apply to open
  composers as soon as they are saved. Rows follow the built-in General
  rows: title and description on the left, one control on the right.
- A Host settings route, `GET` / `POST /api/prompt-peek.settings`, and a
  `~/.dsh/prompt-peek/settings.json` document (mode `0600`) that stores only
  those six fields. The route is registered in an optional child fiber that
  requires Connection, so profiles without it still load the plugin. `cordis.patch.yml` stays the baseline; the file holds
  overrides and "Reset to profile defaults" deletes it.
- A mouse wheel over the search box pages the reply preview while it is open.
- When the reply preview is turned off, the search panel's footer now offers
  **turn on**, which saves the setting and brings the preview back immediately
  (a toast-sized note with no way out made it look like `Space` had broken).
  Hovering it still names the Settings section for the full options.

### Changed

- A pinned interface language switches the plugin's own copy without touching
  DSH's language (and without a reload).
- `PgUp` / `PgDn` move one configured page instead of a fixed 180 px, and a
  long prompt widens its preview window to bring the first search match into
  view instead of always showing the tail.
- The overlay waits for the session binding before attaching, so a composer
  that mounts early cannot lose its first rememberable message.
- English README, Chinese README, and the locale files document the settings.
- Host tests (`npm test`, `node:test`) cover validation, persistence, reset,
  and malformed files against a temporary `DSH_HOME`.

## 0.2.0 - 2026-11-09

### Added

- Syntax highlighting in the reply preview. Fenced code is rendered by the
  host's shared `CodeBlock` (Shiki, on-demand grammars, light and dark theme
  tokens) instead of a plain `<pre>`, so it also gains the language banner,
  copy button, and wrap toggle of a chat reply.

### Changed

- The preview reads the shared `CodeBlock` from the web shell's platform module
  table (`@deepseek-ai/dsh-client-ui-primitives`); hosts that do not expose it
  still get the old plain code block with a language label.
- Copy and wrap captions are localized in the plugin's zh/en dictionaries.

## 0.1.2 - 2026-11-09

### Added

- Complete Simplified Chinese documentation in `README.zh-CN.md`, linked from
  the English README and selected for the Chinese plugin detail page.

### Changed

- Move the host and client entries into `src/` and the icon into `assets/`, and
  update the package exports, files list, and `npm run check` paths.
- Declare the manifest `icon`, export `./package.json`, and add localized
  `meta.detail` so the plugin list and detail page can read the package metadata.
- No runtime behavior changes.

## 0.1.1 - 2026-11-09

### Changed

- Toggle the reply preview with `Space`; `Shift+Space` types a literal space in
  the search query.
- `PgUp` / `PgDn` glide through the reply preview instead of jumping. Holding the
  key keeps scrolling, releasing stops, and wheel, touch, or scrollbar input
  cancels the glide immediately.
- Preview paging respects `prefers-reduced-motion`.

### Fixed

- The preview glide could stall on the last pixels when the browser rounded
  `scrollTop`.

## 0.1.0 - 2026-11-09

### Added

- Arrow-key recall of prompts sent in the current session.
- `Ctrl+R` search with live filtering and match highlighting.
- Markdown preview of the reply to the selected prompt, toggled with `Ctrl+Space`.
- Page keys for the reply preview.
- English and Chinese plugin-list metadata.
