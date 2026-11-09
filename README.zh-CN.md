# dsh-prompt-peek

[English](README.md) | **简体中文**

**给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 网页版输入框带来 Shell 风格的提示词回翻，以及带 Markdown 渲染的回答预览。**

在空输入框按 `↑` 翻回上一条你发过的消息，继续按往更早翻，`↓` 往新翻。`Ctrl+R` 搜索当前会话的提示词，选中后按 `空格` 预览 dsh 当时的回答。

## 功能

- **回翻** — 上下方向键按时间倒序翻阅当前会话里你实际发过的消息，连续重复的会合并；插件安装前发出的消息也会包含。
- **搜索** — `Ctrl+R` 在输入框上方打开浮动面板，实时过滤并高亮匹配。搜索框是真实输入框，中文/日文输入法可以正常工作。
- **预览** — 在选中的消息上按 `空格`，渲染 dsh 当时给出的回答：取收尾的助手文本，排除工具调用和推理，按 Markdown 渲染（标题、列表、任务列表、引用、带语言标签的代码块、对齐表格，链接仅允许安全协议）。
- **平滑翻页** — `PgUp` / `PgDn` 在长回答里缓动滚动而不是直接跳。连续按会接力成一段连续运动，滚轮、触摸或拖动滚动条会立即接管，`prefers-reduced-motion` 下回退为直接跳转。
- **零足迹** — 不写任何数据，也不发出任何请求；历史按需从会话自己的事件窗口读取。

## 按键

### 输入框

| 按键 | 作用 |
| --- | --- |
| `↑` | 回翻上一条提示词。仅在空输入框开始，之后可持续翻阅。 |
| `↓` | 往较新的提示词翻；超过最新一条后清空输入框。 |
| `Esc` | 退出历史翻阅（回填的文字保留在输入框）。 |
| `Enter` | 发送回填的提示词，和手动输入完全一样。 |
| `Ctrl+R` / `Cmd+R` | 打开当前会话提示词的反向搜索。 |

### 搜索面板

| 按键 | 作用 |
| --- | --- |
| `↑` / `↓` | 选择匹配项。 |
| `空格` | 切换所选提示词对应回答的 Markdown 预览。 |
| `Shift+空格` | 在搜索框中输入一个普通空格。 |
| `PgUp` / `PgDn` | 让回答预览平滑滚动约十行；长按连续滚动，松开即停。 |
| `Enter` | 把选中的提示词填入输入框。 |
| `Esc` | 关闭搜索。 |

搜索框获得焦点时 `空格` 专用于预览，因此查询中需要空格时请用 `Shift+空格`；面板底部会同时提示两者。翻阅历史时，输入框上方的小胶囊会显示当前位置（`History 3/12`）。

## 安装

### 要求

- DSH 0.2.x 网页版 GUI。
- 无构建步骤、无运行时依赖，bundle 是纯 JavaScript。

### 从插件页面安装

1. 打开 DSH 侧边栏的 **Plugins** 页面。
2. 在安装入口填入 bundle spec：本地 checkout 用这个目录的绝对路径即可；发布到 npm 后也可以直接用包名。
3. 如果 bundle 没有自动启用，请手动启用。如果网页没有立即加载，刷新一次页面；无法热组合新 bundle 的宿主需要重启 DSH。

### 从 agent 会话安装

同样可以用 `plugin_manager` 的 `install_bundle`，把本目录作为 `target`。

## 工作原理

插件在输入框的 `conversation.input.overlay` 槽注册一个条目。该条目在输入框卡片上挂一个捕获阶段的键盘监听，因此能在 Lexical 之前拿到按键；它通过输入框自己的 `inputActions.setDraft()` 写入草稿，而不是直接操作编辑器 DOM。

历史来自 `sessions.binding(sessionId).eventSource` 中 `source.kind === 'user'` 的 `user/message` 事件，按顺序读取。回答预览从该消息向后找到下一条人类消息，收集其中的 `assistant/message` 文本块。

没有构建步骤和依赖：整个客户端部分都是 `src/client.js` 里的纯 JavaScript，包括一个小型 Markdown 渲染器和预览滚动动画；插件代码不能导入其他 Harness 客户端包。

## 项目结构

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

`src/index.js` 是宿主侧（目前没有宿主行为），`src/client.js` 是客户端入口，包含键盘处理、Markdown 渲染和样式。`locale/` 同时用于插件列表的显示元数据和插件详情页的文档选择。

## 开发

1. 从本目录安装 bundle。
2. 修改 `src/client.js`。
3. 重新加载客户端模块：在 Plugins 页面禁用再启用该 bundle（推荐 HMR），或在宿主无法重新组合时刷新页面 / 重启 DSH。

目前还没有测试运行器。`npm run check` 会对 JavaScript 入口执行 `node --check`；locale JSON 可以用 `node -e` 解析；Markdown 渲染器是纯函数，可以配合 `React.createElement` stub 单独测试。

## 已知限制

- 历史只覆盖会话事件窗口中**已加载**的部分，不是超长会话的完整生命周期。
- 历史按会话隔离；全新会话从空开始。
- 代码块有语言标签，但没有语法高亮。
- Markdown 子集刻意保持扁平：不支持嵌套列表、原始 HTML、图片。
- `Ctrl+R`/`Cmd+R` 只在输入框获得焦点时拦截；在页面其他地方浏览器仍会正常刷新。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## 相关项目

另外两个 DSH 插件覆盖了类似的 Shell 风格输入历史，但没有回答预览：[`dsh-prompt-history`](https://github.com/Xiaofei-fei/dsh-prompt-history) 和 [`dsh-composer-history`](https://github.com/PerryLink/dsh-composer-history)。按需选择；本项目关注的是“看到当时的回答”，而不仅仅是“找回问题”。

## 许可证

MIT — 见 [LICENSE](LICENSE)。
