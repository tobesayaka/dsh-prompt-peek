# dsh-prompt-peek

**English** | [简体中文](README.zh-CN.md)

**Shell-style prompt recall with a Markdown answer preview for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web composer.**

Press `↑` in an empty composer to get the last message you sent back. Keep pressing to walk further back, `↓` to come forward. `Ctrl+R` searches the session's prompts, and `Space` peeks at the reply dsh gave you at the time.

> **中文速览**：在 DSH 输入框里按 `↑` 翻回上一条你发过的消息，`Ctrl+R` 按关键词搜索；选中后按 `空格` 预览当时的回答，`Shift+空格` 在搜索框里输入空格。完整的[中文文档](README.zh-CN.md)在这里。

## Features

- **Recall** — the arrow keys walk the prompts you actually sent in the current session, newest first. Consecutive duplicates are folded; messages sent before the plugin was installed are included.
- **Search** — `Ctrl+R` opens a floating panel above the composer with the prompt list, live filtering, and match highlighting. The query field is a real input, so Chinese/Japanese IME input works.
- **Preview** — `Space` on a selected prompt renders the *answer* dsh produced for that turn: the closing assistant text, with tool calls and reasoning left out, formatted as Markdown (headings, lists, task lists, quotes, fenced code with a language label, tables with alignment, links restricted to safe schemes).
- **Smooth paging** — `PgUp` / `PgDn` glide through a long reply instead of jumping. Consecutive presses join into one motion, wheel, touch, or scrollbar input takes over immediately, and `prefers-reduced-motion` falls back to a direct jump.
- **Zero footprint** — no data is written anywhere and no request leaves the machine. History is read from the session's own event window on demand.

## Keys

### Composer

| Key | Action |
| --- | --- |
| `↑` | Recall the previous prompt. Only starts from an empty composer, then keeps browsing. |
| `↓` | Move back toward newer prompts; past the newest one the composer clears. |
| `Esc` | Leave history browsing (the recalled text stays in the composer). |
| `Enter` | Send the recalled prompt, exactly like typing it. |
| `Ctrl+R` / `Cmd+R` | Open reverse search over the prompts of this session. |

### Search panel

| Key | Action |
| --- | --- |
| `↑` / `↓` | Select a match. |
| `Space` | Toggle the Markdown preview of the reply to the selected prompt. |
| `Shift+Space` | Type a literal space in the search query. |
| `PgUp` / `PgDn` | Glide the reply preview by about ten lines; hold to keep scrolling, release to stop. |
| `Enter` | Put the selected prompt into the composer. |
| `Esc` | Close search. |

`Space` is reserved for the preview while the search box is focused, so a query that needs spaces uses `Shift+Space`. The footer hint shows both. While browsing, a small pill above the composer shows your position (`History 3/12`).

## Install

### Requirements

- DSH 0.2.x with the web GUI.
- No build step and no dependencies: the bundle is plain JavaScript.

### From the Plugins page

1. Open the **Plugins** page in the DSH sidebar.
2. Use its install entry and give the bundle spec — the absolute path of this directory works for a local checkout; a published package name works once released.
3. Enable the bundle if it is not enabled automatically. If the web page does not pick it up immediately, reload the page once; a host that cannot hot-compose new bundles needs a DSH restart.

### From an agent session

The same operation is `plugin_manager` with `install_bundle` and this directory as `target`.

## How it works

The plugin registers one entry in the `conversation.input.overlay` slot of the composer. That entry attaches a capture-phase key listener to the composer card, so it sees the key before Lexical does, and it writes drafts through the composer's own `inputActions.setDraft()` API rather than touching the editor DOM.

History comes from `sessions.binding(sessionId).eventSource`: `user/message` events with `source.kind === 'user'`, in order. The reply preview walks forward from that message to the next human message and collects `assistant/message` text blocks.

No build step and no dependencies: the whole client half is plain JavaScript in `src/client.js`, including a small Markdown renderer and the preview scroll animation, because plugin code must not import other Harness client packages.

## Project layout

```
dsh-prompt-peek/
├── src/
│   ├── index.js
│   └── client.js
├── locale/
│   ├── en.json
│   └── zh.json
├── assets/
│   └── icon.svg
├── README.md
├── README.zh-CN.md
├── CHANGELOG.md
├── LICENSE
├── .editorconfig
├── package.json
└── cordis.patch.yml
```

`src/index.js` is the host half (it has no behavior today); `src/client.js` is the client entry with the keyboard handling, Markdown renderer, and styles. `locale/` serves both the plugin-list metadata and the document selected for the plugin detail page.

## Development

1. Install the bundle from this directory.
2. Edit `src/client.js`.
3. Reload the client module: disable and re-enable the bundle in the Plugins page (HMR recommends it), or reload the page / restart DSH when the host cannot recompose.

There is no test runner yet. `npm run check` runs `node --check` over the JavaScript entry points, and the locale JSON files can be parsed with `node -e`; the Markdown renderer is a pure function that can be exercised with a `React.createElement` stub.

## Known limitations

- History covers the **loaded** part of the session's event window, not the entire lifetime of a very long thread.
- History is **per session**; a brand-new session starts empty.
- Code blocks get a language label but no syntax highlighting.
- The Markdown subset is intentionally flat: no nested lists, no raw HTML, no images.
- `Ctrl+R`/`Cmd+R` are only intercepted while the composer has keyboard focus; the browser reloads normally everywhere else.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Related

Two other DSH plugins cover shell-style input history without the reply preview: [`dsh-prompt-history`](https://github.com/Xiaofei-fei/dsh-prompt-history) and [`dsh-composer-history`](https://github.com/PerryLink/dsh-composer-history). Pick whichever fits; this one is about seeing the answer, not only the question.

## License

MIT — see [LICENSE](LICENSE).
