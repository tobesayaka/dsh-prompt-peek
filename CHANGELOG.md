# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
