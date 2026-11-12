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
| R8 | 打开回答预览（尤其按 `PgDn` 翻长回答）时，提问列表被挤成一条线，文字看不见 | 0.1.0 | 未发布 | `an open reply preview never squeezes the prompt list to nothing (R8)` |
| R10 | `Ctrl+R` 完全没有反应（插件整体没挂载）：重复注册同一份 locale 字典时 `apply` 抛错 | 未发布 | 未发布 | `a duplicate locale registration never takes the composer overlay down (R10)` |
| R11 | 输入框浮层渲染即崩：`Cannot read properties of undefined (reading 'listeners')`，`Ctrl+R` 看起来仍然没反应 | 未发布 | 未发布 | `the locale subscription survives being called without a receiver (R11)` |
| R12 | 设置里 prompt-peek 页面空白：`ReferenceError: bind is not defined` | 未发布 | 未发布 | `every mounted surface renders without a ReferenceError (R12)` |

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

## R8 — 预览一打开，提问列表就被挤没

### 现象

`Ctrl+R` 里选中一条、按空格预览回答；回答一长，按 `PgDn` 往下翻，左边的提问行全部挤在一起，
极小的屏幕高度下**连文字都看不见**。关掉预览立刻恢复正常。

### 根因

不是按键的问题，是面板里的 flex 分配：

```css
.dsh-pp-panel   { max-height:min(70vh,620px); overflow:hidden }   /* 高度被内容撑起，到上限就停 */
.dsh-pp-list    { flex:1 1 auto; min-height:0 }                   /* 提问列表：没有下限，可被压到 0 */
.dsh-pp-row     { white-space:nowrap; overflow:hidden }           /* 行本身也可被压扁，再裁掉字 */
.dsh-pp-preview { flex:0 1 auto; max-height:min(46vh,320px) }     /* 预览：可长到面板的 46% 以上 */
```

预览按上限把面板顶到 `max-height` 后，只剩下 `面板高度 − 顶栏 − 搜索框 − 预览 − 按键提示` 的余量给列表；
余量小于一行行高时，`min-height:0` 允许列表被压成一条缝，行再跟着被压到 0，`overflow:hidden` 把字裁没了。

### 修复要点

- 列表给下限：`min-height:calc(3 * 30px + 2px)`（三整行，含两处 1px 的 `gap`）。
- 行不被压缩：`flex:none` + 固定 `height:30px`。固定内容高度是必须的——行高 20px 的行框装不下
  中文无衬线字体的 ascender + descender，原来正是靠列表无限压缩顺手把这点溢出裁掉；
  行不再压缩后，多出来的字形会越过本行边界，必须由 30px 的行框自己接住。
- 预览上限改成面板的份额：`max-height:40%`，40% + 三行下限永远装得进面板，预览照旧自己滚动、照旧 `PgDn` / `PgUp` 翻页。
- 面板上限放宽：`min(80vh,720px)`，长回答能多看一眼，而列表下限始终有位置。

### 教训

> 只要父容器有 `overflow:hidden`、子项 `min-height:0`、兄弟项又有百分比上限，就是「兄弟赢了、你消失」的结构。
> 靠 `flex-shrink:1` 兜底等于把可用性押在剩余空间上；可见的列表需要一个**绝对长度**的下限，
> 预览的上限则要**减去这个下限**再算（所以用 `%` 而不是 `min(46vh,320px)` 这种与面板脱钩的值）。

### 测试怎么锁

`test/client.test.mjs` 里新增 `#R8` 一条：从 `internals.CSS` 解析出四个选择器，用一个小型
「column flex 求解器」按面板上限（`min(80vh,720px)` 取 720px）算一遍，断言列表 ≥ 三行、
预览不超过自己的上限、整列不溢出面板。内部属性（`flex`、`min-height`、`max-height`）被改动时，
这条测试会直接说出是哪一个不满足。该测试的 `CSS` 导出已在 `internals`，供 `test/` 读取。


---

## R10 — `Ctrl+R` 完全没反应：一次字典注册把整个插件掀翻了

### 现象

`Ctrl+R` 按下去毫无反应，面板、历史胶囊全都不出现；设置页里插件也像没装一样。

### 根因

把界面语言交给 DSH 的 locale 服务后，`apply()` 里改成一次性注册两种语言：

```js
ctx.effect(() => ctx.locale.register(NS, DICTIONARY), 'prompt-peek: dictionaries');
```

宿主的 `register` 对**重复的命名空间 / 语言**是**抛错**的
（`@deepseek-ai/dsh-client-locale`：`locale namespace "…" already has locale "en"`）。
同一个页面里第二次 `apply`（插件单独重载、HMR 重新挂载）就会走到这条分支。

而 `apply` 里**注册输入框浮层的代码在这行之后**（相隔数百行）：

```js
ctx.effect(() => ctx.locale.register(...));        // ← 这里抛出
...
ctx.slots.inject('conversation.input.overlay', ...)  // ← 永远执行不到
```

异常从 `apply` 逃出去，cordis 认为插件挂载失败，`conversation.input.overlay` 根本没注册，
`Ctrl+R` 的监听器也就不存在——**症状是“按键没反应”，根因在几百行之外。**

重构前的代码用 `try/catch` 包住注册，注释也写着 “the service throws on a duplicate
namespace/locale (a reload of this plugin alone), and the earlier registration stays in force”，
重构时把防御连同注释一起删了。

### 修复要点

- `register` 外面套 `try/catch`：重复时 `console.warn` 并用已有的字典继续，返回空 disposer。
- 复现与验证用一个最小 cordis 桩：同一 locale 服务上先后 `apply` 两次。
  修前第二次 `apply` 抛错、浮层挂载数 `0`；修后两次都挂载。

### 教训

> `apply()` 里任何一个“可选”步骤都可能抛错，而它后面的注册才是功能本体。
> 凡是**已知会抛**的调用（重复注册、宿主缺服务），要么 `try/catch`，要么挪到注册之后；
> 判断“按键没反应”先查 `apply` 有没有跑完，而不是查按键本身。

### 测试怎么锁

`test/client.test.mjs` 的 `#R10` 用宿主 `register` 的真实语义搭桩，对同一 locale 服务
连续 `apply` 两次，断言两次都挂载、且挂载数相同。反向验证：去掉 `try/catch`，该测试必须失败。


---

## R11 — 浮层一渲染就崩：`subscribe` 丢了 `this`

### 现象

修好 R10 之后插件能挂载了，但 `Ctrl+R` 看起来**还是没反应**，控制台里是：

```
TypeError: Cannot read properties of undefined (reading 'listeners')
    at subscribe (client.js:2:1)
client.js:22 slot entry crashed in 'conversation.input.overlay': TypeError: ...
```

### 根因

宿主的 locale 服务是**类实例方法**，内部依赖 `this`：

```js
subscribe(fn) { this.listeners.add(fn); return () => { this.listeners.delete(fn) }; }
```

重构时为了让面板跟随语言切换，把它**裸传**给了 React：

```js
React.useSyncExternalStore(
  ctx.locale.subscribe,          // ← 拆出来单独传，this 丢失
  () => ctx.locale.getSnapshot().revision,
  ...
);
```

React 调用 subscribe 回调时没有接收者，`this` 是 `undefined`，`this.listeners` 直接抛错。
异常发生在 `ComposerHistory` 渲染期间，React 的 error boundary 把整个 slot entry 记为
crashed——**`apply` 是成功的，所以既没有“插件没装”的迹象，也不会再报 R10 那种挂载失败**。

对比：旧代码写在 `ctx.effect(() => locale.subscribe(...))` 里，是方法调用，`this` 正确。

### 修复要点

- 包一层箭头保留接收者：`(notify) => ctx.locale.subscribe(notify)`。
- 顺带审了其余 locale 调用：`bind` 返回闭包、在 effect 里调用的是方法形式，都不依赖调用方的 `this`。

### 教训

> **从对象上取方法单独传递，等于把 `this` 变成 `undefined`。**
> 传给第三方（React、事件系统、定时器）的函数一律先包一层箭头。
> 这类错误有个恶劣特性：**挂载不报错，只有第一次渲染才炸**，容易被误判成“插件没装”。

### 测试怎么锁

`#R11` 用一个**模仿宿主语义**的 `LocaleStub`（`subscribe` 访问 `this.listeners`）：
先断言源码里不许出现 `useSyncExternalStore(ctx.locale.subscribe,` 这种裸传，
再对比“裸方法调用会抛错”与“包装后能注册/注销”。反向验证：改回裸传，该测试必须失败。


---

## R12 — 设置页一片空白：工厂函数丢了 `bind`

### 现象

打开 **设置 → prompt-peek**，页面空白，控制台：

```
ReferenceError: bind is not defined
    at t (client.js:1287:1)
    at PromptPeekSettings (client.js:1468:1)
client.js:22 slot entry crashed in 'settings.section': ReferenceError: bind is not defined
```

开关插件后出现，`Ctrl+R` 面板本身是好的——**只有设置页这一个挂载面崩掉**。

### 根因

设置页不是 `apply` 里的内联组件，而是由工厂函数建出来的：

```js
function createSettingsPage(ctx, store, useSettings, useLocaleRevision) {
  ...
  return function PromptPeekSettings() {
    const t = (key) => translateKey(bind, key);   // ← bind 不在这个作用域里
```

`bind` 只在 `apply` 里定义（`const bind = ctx.locale.bind(NS)`）。多语言统一化重构把 `bind`
移到了 `apply`，却**没有把它加进这个工厂的参数列表**，组件体继续引用它。

关键点：**`npm test` 全绿也发现不了**——没有任何测试真正执行过设置页组件。语法检查同样放过它，
因为 `bind` 在别的作用域里是合法标识符。

### 修复要点

- 工厂签名加上 `bind`，调用处传入：`createSettingsPage(ctx, settingsStore, bind, useSettings, useLocaleRevision)`。
- 复核了全部 `translateKey(bind, …)` 调用点，另两处都在 `apply` 作用域内，没有同样的问题。

### 教训

> 把组件抽成工厂函数时，**每个被组件体引用的自由变量都必须进参数表**；漏一个不会有任何编译期提示。
> 只在浏览器里渲染才会暴露，所以测试必须**执行组件体**，而不只是测纯函数。
> 本次三个挂载面（浮层 / 设置页 / 设置页图标）现在都在 R12 里真实跑过一遍。

### 测试怎么锁

`#R12` 用一个最小 React 替身（`createElement` / `useState` / `useRef` / `useMemo` / `useCallback` /
`useSyncExternalStore` 等）驱动 `apply`，再把**每一个注册进 slot 的组件函数真实调用一次**，
断言不抛异常。反向验证：把 `bind` 从 `createSettingsPage` 的参数列表里删掉，该测试必须失败，
并复现出与浏览器一致的 `ReferenceError: bind is not defined`。

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
| `readHistory` / `readMessages` | 「同时搜索回答」：每条提问附带它之后、下一条提问之前的回答文本；工具调用与 reasoning 不进入结果 |
| `browseStep` | 翻看状态的草稿存取：每一条退出路径都写回原草稿 |
| `filterHistory` | 搜索过滤：默认只搜提问；开关打开后也搜回答，且只有回答命中才标 `answerHit` |
| `ownsComposerKey` | `Ctrl+R` / `Cmd+R` 的归属判定（纯函数；组件另有一条源码守卫，确保先检查焦点） |
| `CSS` | R8：面板 / 列表 / 行 / 预览的布局约束（解析 CSS 后求解，不依赖浏览器） |
| `apply`（直接调用） | R10：重复注册 locale 字典时插件仍然挂载，`Ctrl+R` 的浮层照常注册 |
| `LocaleStub`（测试内） | R11：`subscribe` 依赖 `this`，裸传会让浮层渲染即崩 |
| 全部 slot 组件（R12） | 各挂载面真实渲染一次：工厂函数漏传的自由变量（如 `bind`）会在这里炸出来 |

**改这些函数时，先跑测试；新增行为时，先写一条会在旧实现上失败的测试。**

```bash
npm test          # 48 个测试（宿主 13 + 客户端 35）
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

R12 的反向验证：把 `bind` 从 `createSettingsPage` 的参数列表里删掉（调用处不变），`#R12` 必须
失败并报出 `ReferenceError: bind is not defined`；换回必须通过（本次照此验过）。

R11 的反向验证：把 `useLocaleRevision` 里的 `(notify) => ctx.locale.subscribe(notify)` 改回裸传
`ctx.locale.subscribe`，`#R11` 必须失败；换回必须通过（本次照此验过）。

R10 的反向验证：把 `ctx.locale.register` 外面的 `try/catch` 去掉，`#R10` 必须失败；换上必须通过（本次照此验过）。

R8 的反向验证：把 `.dsh-pp-list` 的 `min-height` 改回 `0`、行的 `flex:none` 与 `height:30px` 去掉、
`.dsh-pp-preview` 的 `max-height:40%` 改回 `min(46vh,320px)`、面板上限改回 `min(70vh,620px)`，
`#R8` 必须失败；换回来必须全部通过（本次照此验过）。

R6 / R7 的反向验证：把 `stepIndex` 的越界返回值改回 `0`、把 `pagePlan` 的 `edge` 改回 `scroll`，
新增的两条测试必须失败；换回来必须全部通过（0.4.0 发布前照此验过）。

清单之外还补了两条源码级守卫（`test/settings.test.mjs`）：组件必须先确认按键发生在
输入框里才问 `ownsComposerKey`（否则会劫持整页的 `Ctrl+R`），以及翻看 / 过滤必须走
`browseStep` / `filterHistory`，而不是各写一份内联循环。反向验证：把 `ownsComposerKey`
判定换回内联写法、把 `browseStep` 的退出草稿改成空串，对应测试都会失败。
