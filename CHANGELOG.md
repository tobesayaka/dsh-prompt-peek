# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
