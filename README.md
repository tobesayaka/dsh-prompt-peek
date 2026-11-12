# dsh-prompt-peek

**English** | [简体中文](README.zh-CN.md)

**Shell-style prompt recall with a Markdown answer preview for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web composer.**

Press `↑` in an empty composer to get the last message you sent back. Keep pressing to walk further back, `↓` to come forward. `Ctrl+R` searches the session's prompts, and `Space` peeks at the reply dsh gave you at the time.

> **中文速览**：在 DSH 输入框里按 `↑` 翻回上一条你发过的消息，`Ctrl+R` 按关键词搜索；选中后按 `空格` 预览当时的回答，`Shift+空格` 在搜索框里输入空格。完整的[中文文档](README.zh-CN.md)在这里。

## Features

- **Recall** — the arrow keys walk the prompts you actually sent in the current session, newest first. Consecutive duplicates are folded; messages sent before the plugin was installed are included.
- **Search** — `Ctrl+R` opens a floating panel above the composer with the prompt list, live filtering, and match highlighting. The query field is a real input, so Chinese/Japanese IME input works.
- **Preview** — `Space` on a selected prompt renders the *answer* dsh produced for that turn: the closing assistant text, with tool calls and reasoning left out, formatted as Markdown (headings, lists, task lists, quotes, fenced code, tables with alignment, links restricted to safe schemes). Fenced code is rendered by the host's own Shiki-based `CodeBlock`, so it is syntax highlighted in both themes and keeps the language label plus the copy and wrap controls of a chat reply.
- **Smooth paging** — `PgUp` / `PgDn` glide through a long reply instead of jumping. Consecutive presses join into one motion, wheel, touch, or scrollbar input takes over immediately, and `prefers-reduced-motion` falls back to a direct jump.
- **Zero footprint** — no data is written anywhere and the session log is never read from disk. History comes from the session's own event window, and when that window holds fewer prompts than the history limit the plugin asks the Host for older pages (`session.loadOlder()`), so no external request is made.

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
| `PgUp` / `PgDn` | Glide the reply preview by the configured page distance (default 270 px, about fifteen lines); hold to keep scrolling, release to stop. If the preview is not open yet, the first press opens it; at the top or bottom edge it moves the selection to the previous or next prompt instead of doing nothing. |
| Mouse wheel | While the preview is open, the wheel over the search box scrolls the reply a quarter page per notch. |
| `Enter` | Put the selected prompt into the composer. |
| `Esc` | Close search. |

`Space` is reserved for the preview while the search box is focused, so a query that needs spaces uses `Shift+Space`. The footer hint shows both. While browsing, a small pill above the composer shows your position (`History 3/12`).

## Settings

The plugin has its own section in **Settings** — a sidebar row named **Prompt peek**, between *Shell* and *Built-in plugins* — so its preferences are a page of their own rather than a tab buried inside another section. Language is the first group and applies the moment you pick it; the behavior rows save together, because they are one policy.

| Setting | Default | What it does |
| --- | --- | --- |
| Interface language | Follow the DSH interface | `中文` or `English` pins the plugin's own copy — the search panel, the history pill, and this page — even while DSH runs in the other language. Chosen from a small globe menu and saved on the spot. **Follow the DSH interface** takes the language from DSH's active locale live, including `zh-CN`-style tags, so the panel and this page switch whenever DSH's language does. |
| Show reply preview | on | When off, `Space` no longer opens the reply preview. The panel footer says so and offers **turn on**, which saves the change and brings the preview back immediately. |
| Smooth paging | on | `PgUp` / `PgDn` and the wheel glide through the preview instead of jumping. Systems that ask for reduced motion always jump. |
| Page distance | 270 px (≈ 15 lines) | How far one `PgUp` / `PgDn` press moves the preview. One mouse-wheel notch moves a quarter of that. Once the preview reaches either edge, `PgUp` / `PgDn` move the selection to the previous / next prompt instead of appearing to do nothing. |
| History limit | 300 | How many of the session's most recent prompts recall and search read. |
| Result order | Newest first | `Oldest first` lists matches like a rendered listbox (ARIA pops the listbox upward, so keeping the selected prompt next to the composer is `Newest first`, the shell order). |

**Save** writes the whole form; **Reset to profile defaults** deletes the settings file. A save applies immediately in open composers, without a reload.

Settings live in `~/.dsh/prompt-peek/settings.json` (file mode `0600`), not in the DSH user-settings document, so a local checkout shared by several profiles keeps one set of preferences. Only these six fields are stored — never prompts, replies, or session text. `cordis.patch.yml`'s `config` is the baseline; the file holds overrides.

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

Opening search (`Ctrl+R`) or pressing `↑` for the first time asks the Host for older pages until the window holds the history-limit number of prompts (the Host buffers one session page by default, which is why a short history used to appear as only a few rows); it stops at the limit or when the Host says there is nothing older, and the panel count shows “Loading earlier prompts…” while it happens.

History and the reply preview read the same scan of `sessions.binding(sessionId).eventSource`: a human message is any `user/message` with `source.kind === 'user'`, an assistant message is any event carrying text in `data.message.content`, and everything else (edits, replacements, tool calls) simply stays in place. The reply preview walks forward from the selected prompt to the next human message; the prompt's own text doubles as the key, so a snapshot rebuilt between listing and previewing still matches. A long prompt keeps its last 400 characters and widens back to 6000 characters when the first search match lies earlier, marking that paragraph so the preview scrolls to it — the selected list row then shows *why* it matched.

The Host half owns the settings route `GET` / `POST /api/prompt-peek.settings` (read, save a patch, or `{ "reset": true }`), registered on Connection's shared `/api` handler so it inherits the same cookie, Host/Origin, and Peer checks as every other plugin route. Connection is declared inside an optional child fiber, so a profile without it still loads the plugin. The client reads the route when the section opens; the section itself registers into the `settings.section` and `settings.section.icon` slots with its own nav label and globe icon.

While the page is closed the plugin works from its documented defaults; values saved during the session apply to every open composer at once. A DSH language switch is followed only under **Follow the DSH interface** — a pinned language keeps the plugin's own copy.

No build step and no dependencies: the whole client half is plain JavaScript in `src/client.js`, including the Markdown renderer and the preview scroll animation. It reaches the host only through the web shell's frozen platform module table — `react` for the UI and `@deepseek-ai/dsh-client-ui-primitives` for the shared `CodeBlock`; when a host does not expose that component, the preview falls back to a plain `<pre>` with a language label.

## Project layout

```
dsh-prompt-peek/
├── src/
│   ├── index.js
│   └── client.js
├── test/
│   └── settings.test.mjs
├── docs/
│   └── REGRESSIONS.md
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

`src/index.js` is the host half (settings route and file); `src/client.js` is the client entry with the keyboard handling, Markdown renderer, Settings page, and styles. `locale/` serves the plugin-list metadata, the document selected for the plugin detail page, and the tab label.

## Development

1. Install the bundle from this directory.
2. Edit `src/client.js`.
3. Reload the client module: disable and re-enable the bundle in the Plugins page (HMR recommends it), or reload the page / restart DSH when the host cannot recompose.

- `npm test` runs the Host settings tests (`test/settings.test.mjs`, `node:test`): validation, persistence, reset, and the malformed-file fallbacks. The tests use a temporary `DSH_HOME`, never the real one. It also runs `test/client.test.mjs`, which loads the client factory in a `vm` sandbox (no browser) and checks the pure helpers it returns: language resolution, key routing, and a frame-by-frame simulation of the preview glide.
- `npm run check` runs `node --check` over both entry points.
- Client changes need a page reload or a disable/enable of the bundle; Host changes need a DSH restart.
- Before changing `glideStep`, `glideFrame`, `pagePlan`, or `translateKey`, read [docs/REGRESSIONS.md](docs/REGRESSIONS.md) and run its reverse checks: put the old code back and watch the named tests fail.

## Known limitations

- History is paged up to the history limit (300 prompts by default) but never beyond what the Host can still provide; the older part of a very long thread still needs the transcript's own “load earlier” to pull it in on the Host side.
- History is **per session**; a brand-new session starts empty.
- The Markdown subset is intentionally flat: no nested lists, no raw HTML, no images.
- `Ctrl+R`/`Cmd+R` are only intercepted while the composer has keyboard focus; the browser reloads normally everywhere else.
- The plugin's language covers the plugin's own surfaces (search panel, history pill, Settings page). DSH's slot chrome around the Settings tab is labelled by the host, which follows the DSH language.
- The Settings page reads the saved file when it opens. A change made by editing the file directly is picked up after the page is reopened or the plugin is restarted.

## Known regressions

[docs/REGRESSIONS.md](docs/REGRESSIONS.md) records the bugs this plugin has shipped and fixed — how the
language follow broke, why `PgUp` / `PgDn` appeared to do nothing, and the per-frame sign bug that made
`PgUp` scroll downward forever. Each entry names the test that keeps it from coming back.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Related

Two other DSH plugins cover shell-style input history without the reply preview: [`dsh-prompt-history`](https://github.com/Xiaofei-fei/dsh-prompt-history) and [`dsh-composer-history`](https://github.com/PerryLink/dsh-composer-history). Pick whichever fits; this one is about seeing the answer, not only the question.

## License

MIT — see [LICENSE](LICENSE).
