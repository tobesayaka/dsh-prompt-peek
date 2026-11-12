# 问题档案 / Regressions

这里记录 `dsh-prompt-peek` 已经踩过、修过、并且**用测试锁住**的问题。目的是让下一个人（或下一次的 AI）
不必从零重新定位同一处代码。

新增条目时请同时：**补一条会在旧代码上失败的测试**，并在 [CHANGELOG.md](../CHANGELOG.md) 记一行。
只有“有测试能证明它不会回来”的问题才写进来。

| ID | 问题 | 引入版本 | 修复版本 | 测试 |
| --- | --- | --- | --- | --- |
| R1 | `Ctrl+R` 面板永远是英文，不跟随 DSH 界面语言 | 0.3.0 | 0.3.4 | `the language follows DSH under auto…`、`auto on a Chinese interface…`、`auto prefers a host translation…`、`auto follows a DSH language switch…`、`a pinned language ignores DSH…`、`every key the panel asks for exists in both languages` |
| R2 | 预览未打开时按 `PgUp` / `PgDn` 没有任何反应 | 0.1.0 | 0.3.4 | `PgUp and PgDn page the preview, open it when hidden, and never do nothing` |
| R3 | 按 `PgUp` 预览缓慢**向下**滚动，且停不下来 | 0.3.3 | 0.3.4 | `an upward glide step is negative, never +1`、`PgUp from a scrolled preview lands on the top, frame by frame`、`PgUp during a PgDn glide turns it around instead of continuing down` |
| R6 | `↑` 在输入框有草稿时不翻历史；`↑` / `↓` 到头即停，退出翻看时草稿被丢掉 | 0.1.0 | 0.4.0 | `↑ and ↓ wrap around the walk, and ↓ past the newest entry returns to the draft` |
| R7 | 回答翻到顶 / 到底后继续按 `PgDn` / `PgUp` 会串到下一条提问 | 0.1.0 | 0.4.0 | `PgUp and PgDn page the preview, open it when hidden, and never do nothing` |
| R5 | `Ctrl+R` / `↑` 只能看到宿主已缓冲的那一页提示词 | 0.1.0 | 未发布 | `the panel asks the Host for older pages until it has historyLimit prompts (R5)`、`a session without older history never loops, and a short session stays short (R5)`、`loading counts prompts the same way the list does, and never double-loads (R5)` |

---

## R1 — 面板不跟随 DSH 界面语言

### 现象

DSH 设为中文，`Ctrl+R` 面板、历史胶囊、设置页标签全是英文；只有去设置里手动选「中文」才正常。
「跟随 DSH 界面语言」这一项等于摆设。

### 根因

`makeTranslate` 的 `auto` 分支问宿主要译文，然后把**任何等于 key 的返回值**都当成“宿主没有这个字典”，
再回退到写死的英文表；而且它从未读取 `locale.getSnapshot().active`：

```js
const current = ctx.get('locale');
const text = current.bind(NS)(key);   // 宿主：没有条目时原样返回 key
if (text === key) return own[key] ?? key;   // own 永远是英文表
```

DSH 的 `LocaleRuntime` 在命名空间里查不到条目时返回 key 本身，所以中文界面下每一步都落到英文。

### 修复要点

- 语言从 `locale.getSnapshot().active` 解析（`zh`、`zh-CN` 都算中文），**每次调用都重新读**，
  这样 DSH 切语言时不需要重挂载。
- 解析顺序：锚定语言 → 内置表；`auto` → 宿主译文 → 当前语言的内置表。
- 内置表与宿主注册的字典**同一份数据**，两条路径的 key 集合一致，不会再分叉。
- 设置页与侧栏 label 用同一条规则（`effectiveLanguage` / `translateSettingsKey`）。

### 教训

> 宿主的 `t(key)` 用“返回 key”表示缺失，不是一个可以直接当布尔用的接口。
> 任何“回退语言”都必须回退到**当前语言**，而不是写死一种语言。

---

## R2 — 预览没打开时 `PgUp` / `PgDn` 没反应

### 现象

`Ctrl+R` 打开面板后直接按 `PgUp` / `PgDn`，什么都没发生。

### 根因

处理条件是 `previewVisible && (PageUp || PageDown)`。而 `previewVisible = previewOpen && matches.length > 0 && allowPreview`，
`previewOpen` 默认 `false` —— 必须再按一次空格才会创建预览滚动容器。条件为假时按键**没有被阻止**，
于是落到宿主聊天视口的 `SCROLL_KEYS`（`ArrowUp/Down, PageUp/Down, Home/End, Space`），
滚的是面板背后的聊天记录，看起来就是“没反应”。

### 修复要点

- 抽出纯函数 `pagePlan(delta, previewVisible, allowPreview, atEdge)`，四种结果：
  `none`（设置里关了预览，保留原生行为）/ `open`（先打开预览，下一帧翻页）/
  `scroll`（翻一页）/ `step`（到边了，切换选中项）。
- 搜索框、历史浏览、编辑器三条路径都接管 `PgUp` / `PgDn`，永远不再漏给聊天视口。
- 面板底部按键提示里的 `PgUp` / `PgDn` 始终显示。

### 教训

> 一个按键“没反应”，先看**谁处理了它**。宿主视口也在监听这批键，
> 插件不处理时不会变成无事发生，而是去滚别的东西。

---

## R3 — 按 `PgUp` 预览缓慢向下滚，停不下来

这个问题修了三轮才修对，记录完整过程，因为前两轮都**修错了地方**。

### 现象

`PgDn` 下翻正常、距离也对；但按 `PgUp` 后预览**继续向下**缓慢移动，怎么按都停不下来。

### 根因（真正的那个）

`0.3.3` 为了“整像素步进”改写了动画循环：

```js
const remaining = animation.target - el.scrollTop;   // 向上时是负数
const advance = Math.max(1, remaining * (1 - Math.exp(-elapsed / TAU)));
const applied = remaining > 0 ? Math.floor(advance) : Math.ceil(advance);
```

`advance` 本身**已经带符号**。向上滚时它是 `-1` 附近，而 `Math.ceil(-0.99…) === -0`，
再被外面的 `Math.max(1, …)` 夹成 **`+1`**。于是每一帧都执行 `scrollTop += +1`：
预览每次向上走 1 像素，就被整体往下推 1 像素，**净移动为零且永远到不了目标**。
渐近曲线让 `advance` 一直贴住 `-1`，所以“缓慢下翻、按多少次都没用”。

对照修复（`glideStep`）：符号只来自 `Math.sign(remaining)`，按运动方向取整。

```js
const left = Math.abs(remaining);
const travel = Math.max(1, Math.floor(left * (1 - Math.exp(-seconds / time))));
return Math.sign(remaining) * Math.min(travel, Math.ceil(left));
```

### 引入与回归时间线

| 版本 | 写法 | 结果 |
| --- | --- | --- |
| `a29cefb` 0.1.0 | `scrollTop += ±PREVIEW_PAGE` 直接跳转 | 正常（无动画） |
| `4a73610` | `el.scrollTop += remaining > 0 ? advance : -advance` | 正常 |
| `80ae27a` 0.3.2 | 同上一行，只改了每页距离与滚轮 | 正常 |
| `d2fc472` **0.3.3** | `Math.floor/ceil(advance)`，丢了符号 | **R3 出现** |

### 前两轮为什么没修对

- 第 1 轮：判断是“按键路由问题”（预览没开、按键漏给聊天视口）。修的是 R2，R3 原样存在。
- 第 2 轮：怀疑“按下时目标从旧目标算起”，重写了 `glideFrame`。方向判据改了，
  但**每帧步长**那一行没动，所以现象不变。
- 第 3 轮：从**第一次提交**逐行对照，才发现 `advance` 的取整把符号弄丢了。

### 教训

> 1. 现象是“往反方向走”，优先看**每帧写入量的符号**，而不是目标怎么算。
> 2. `Math.floor` / `Math.ceil` 用在带符号量上会朝零取整，配合 `Math.max(1, …)`
>    会把负步长变成正步长。带符号步长一律 `Math.sign(x) * Math.floor(Math.abs(x))`。
> 3. 修 bug 时先做**旧代码上的失败测试**。前两轮的测试之所以"通过"，
>    一部分原因是我写的模拟器复刻错了组件公式（每帧传固定 `elapsed`），
>    于是旧 bug 被掩盖；模拟器还原的是 `glideStep` 本身之后才抓住了问题。

---

## R5 — 历史只有宿主缓冲的那一页

### 现象

新会话或长会话里按 `Ctrl+R` / `↑`，只出现 3、4 条提示词，和设置里的「历史条数上限 300」完全无关；
先在聊天界面点「发现更早」并往上滚一段，再打开面板，条目才变多。

### 根因

不是插件截断，而是**宿主的分页**：DSH 打开会话时只加载第一页（`paginate`，按消息数与 turn 对齐切分，
`HISTORY_PAGE_OPTIONS = { maxMessages: 500, turnWindow: { minMessages: 50, minTurns: 2 } }`），
更早的页只有在聊天界面往下翻时才由 `loadOlder()` 前插进同一个 `eventSource`。
插件从 0.1.0 起就只读 `eventSource.getSnapshot()`（这是有意的零足迹设计），
所以看到多少条完全取决于宿主已经加载了多少——而 `historyLimit` 只是**上限**，从没负责「往下拉」。

### 修复要点

- `loadHistory()`：循环调用 `binding.session.loadOlder()`，直到提示词数达到 `historyLimit`、
  宿主 `hasMore` 为 `false`、或某一页没有进展（防止宿主声称还有却不再前进），上限 `MAX_OLDER_PAGES`。
- `Ctrl+R` 打开面板与第一次 `↑` 都会触发；并发触发共享同一次加载（`growing` ref），不会叠加请求。
- 计数口径与列表一致：`promptCount()` 折叠连续重复，和 `readHistory()` 同一规则。
- 加载期间面板计数区与历史胶囊显示「正在加载更早的提示词…」。
- 数据源不变：仍只读事件窗口，不写盘、不读会话日志——`loadOlder()` 只是让宿主多给几页。

### 教训

> 「只读已加载窗口」不等于「用户要的那么多」。宿主的分页对插件是透明的，
> 只要不主动 `loadOlder()`，`historyLimit` 就只是一个永远够不到的上限。
> 判断历史为什么少，先问**宿主加载了多少**，再看插件截了多少。

---

## 用测试锁住这些问题的做法

`test/client.test.mjs` 不依赖浏览器：用 `vm` 跑 `src/client.js` 的模块工厂，取它返回的 `internals`。
`internals` 里都是纯函数，可被直接断言：

| 导出 | 用途 |
| --- | --- |
| `effectiveLanguage` / `translateKey` / `makeTranslate` | R1：语言解析与回退 |
| `pageDirection` / `pagePlan` | R2：按键决策表 |
| `promptCount` / `loadHistory` | R5：补页循环的停止条件与计数口径 |
| `glideFrame` / `glideStep` | R3：每帧步长的符号与距离 |
| `stepIndex` | R6：`↑` / `↓` 的循环与回到草稿 |
| `readHistory` | 「同时搜索回答」：每条提问附带它之后、下一条提问之前的回答文本 |

**改这些函数时，先跑测试；新增行为时，先写一条会在旧实现上失败的测试。**

```bash
npm test          # 30 个测试（宿主 10 + 客户端 20）
npm run check     # node --check
```

### 确认测试真的能抓住回归

R3 的三条测试是这样验过的：把 `glideStep` 临时换回 0.3.3 的写法，这三条必须失败，换回来必须全部通过。

```js
// 0.3.3 的写法（故意错误，仅用于验证测试有效）
const advance = Math.max(1, remaining * (1 - Math.exp(-seconds / time)));
return remaining > 0 ? Math.floor(advance) : Math.ceil(advance);
```

R1 同理：把 `translateKey` 的 `own`（回退表）改回固定 `composerDictionary('en')`，
前两条语言测试应当失败。**任何新加的回归测试都请做一次这样的反向验证**，否则它可能只是碰巧通过。

R6 / R7 的反向验证：把 `stepIndex` 的越界返回值改回 `0`、把 `pagePlan` 的 `edge` 改回 `scroll`，
新增的两条测试必须失败；换回来必须全部通过（0.4.0 发布前照此验过）。
