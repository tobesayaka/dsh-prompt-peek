# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- A footer note names the Settings page when the reply preview is turned off.

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
