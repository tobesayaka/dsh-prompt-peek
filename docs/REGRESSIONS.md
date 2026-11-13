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
| R8 | 打开回答预览（尤其按 `PgDn` 翻长回答）时，提问列表被挤成一条线，文字看不见；预览时提问区仍占 10 行，头重脚轻 | 0.1.0 | 未发布 | `the prompt list shows ten rows resting and five with the answer open (R8)` |
| R9 | 用 `↑` / `↓` 切换回答时面板高度瞬间跳变；预览框不跟面板一起伸缩、动画偏快 | 未发布 | 未发布 | `the panel glides between replies as a pixel height (R9)`、`the panel height is measured on a clone, never by resizing the panel (R9)` |
| R13 | 回答区的高度靠 JS 算、和提问区、快捷键指引挤在同一列里：预览时快捷键指引被推到面板中间、回答被挤小，改数字永远无效 | 0.4.0 | 未发布 | `the answer region takes what the list and the hint row leave (R8/R9)`、`the hint row sits outside the body region, after the answer` |
| R14 | 空格键、回答区、回复正文三条路径各自判断“要不要显示回答”：选中一条还没回答的提问也能打开空回答；设置里关掉预览后空格仍能打开 | 0.1.0 | 未发布 | `Space opens an answer only when a reply is waiting under the selection`、`the answer area follows the same rule as the key`、`the panel and the Space key both read the one preview rule`、`the answer belongs to the selected prompt, never to its neighbour` |
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

- 列表给下限：`min-height:calc(3 * 30px + 2px)`（三整行，含两处 1px 的 `gap`）
  ——之后这条下限让位给 R13 的按状态上限（非预览 10 行、预览 5 行，`listCap()`）。
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

`test/client.test.mjs` 的 `#R8` 条：`listCap(false) = 10 行`、`listCap(true) = 5 行` 是组件规则，
样式表里的行高（30px）、间距（1px）、内边距（1px）必须和这条规则算出同一个上限；行本身仍
`flex:none`、不被压缩。最初的「column flex 求解器」版本随 R13 的结构拆分一起退场
（预览高度不再由 JS 算，没有可求解的百分比上限）。



---

## R9 — 面板一跳一跳地换高度，预览框不跟着伸缩

### 现象

用 `↑` / `↓` 换回答时：面板高度**瞬间跳变**（一会往上伸、一会缩回去）；后来加了高度过渡，
又出现新问题——**面板平滑地伸缩了，但里面的预览框不跟着伸缩**，而且快得看不清。

### 根因（两层）

第一层：面板高度完全由内容决定，换回答就是 `auto → auto`，没有任何过渡。

第二层更隐蔽。面板改成由 JS 设定的像素高度后有了 140ms 过渡，但预览仍是：

```css
.dsh-pp-preview { flex: 0 1 auto; max-height: 40%; }   /* 40% 相对面板，随面板每帧重算 */
```

`40%` 的参照物是面板高度，而面板正在动画。预览**没有自己的过渡**，所以每一帧都直接取
「当前面板高度 × 40%」，结果是第一帧就吃掉大部分空间、然后慢慢爬：

```
面板: 557 → 578 → 619 → 658 → 684 → 701 → 711 → 717 → 720
预览:  55 → 224 → 241 → 256 → 267 → 273 → 278 → 280 → 281
              ↑ 第一帧就跳到终值的 80%
```

看起来就是「预览框先猛地弹开，面板才慢慢追上」。

### 修复要点

- 面板由 JS 定像素高度并过渡：`190ms cubic-bezier(.4,0,.2,1)`（原 140ms `ease`），
  `prefers-reduced-motion` 下关闭。
- 测量在**离屏克隆**上做（`measurePanel`）：克隆 `height:auto`，并把回答框从克隆里摘掉，
  量到的才是“关掉回答时面板要多高”。测量**绝不能碰真实面板**：清空高度再写回会因「值未变」而取消过渡（实测于 Chrome 151）。
- 预览曾经也由 JS 定像素高度（`previewHeight`，面板的 40%）。**这条已撤销**：见 R13，
  回答改成弹性子项后浏览器自己分配高度，`previewHeight` 与它的 ref/state 都已删除。

### 教训

> **一个尺寸是另一个尺寸的百分比时，两者不可能自然同步**——参照物在动画中，百分比每帧都在变。
> 想让两个盒子一起伸缩，就给它们同一个像素来源、同一条时间曲线。
> 另外：`height:auto` 在两个 auto 之间不插值，`interpolate-size` 只在「一端是长度」时有用；
> 而**同一次任务里清空再写回同一属性会让浏览器取消过渡**。

### 测试怎么锁

- `panelHeight`：纯函数规则（非预览封顶 `min(80vh,720px)`、预览 70vh 并夹在 360–1200px、关闭时回 `auto`）。
- 源码守卫：测量必须走 `measurePanel`、必须把回答框摘出克隆、**不许** `panel.style.height = ''`。
- 回答区自身的伸缩规则归 R13 的测试（不再有 `previewHeight`）。

---

## R13 — 三个区域挤在一列里，回答区和快捷键指引互相推挤

### 现象

按空格预览后，面板底部的快捷键指引会往上跑到回答区上方，回答区下面留出一截空白；
反复调“回答高度 = 面板 − 列表 − …”的数字，界面上**毫无变化**。
期间还出现过预览区只剩一行、退出预览后提问区仍停在 5 行等连带问题。

### 根因

提问列表、回答、快捷键指引三者是同一个纵向 flex 列里的兄弟，但**没有分工**：

```css
.dsh-pp-list    { flex:1 1 auto; min-height:0 }   /* 吃满剩余空间 */
.dsh-pp-preview { flex:none; height:<JS 算出的像素> } /* 固定，且高度靠 JS 猜 */
.dsh-pp-hint    { /* 普通块，谁也没说它占不占剩余空间 */ }
```

回答的高度是 JS 用“面板高 − 列表 − 间距 − padding…”**估**出来的；只要估漏一项
（提示行、行间距、边框、列表内边距），浏览器就会按自己的 flex 规则重新分配，
把提示行推上去、在底部留白。**数字永远追不上布局**，改多少次都无效。

### 修复要点

拆成三个明确分工的块，并用一层 body 区域承担“剩余高度”：

```
.dsh-pp-panel
├─ .dsh-pp-head / .dsh-pp-search
├─ .dsh-pp-body            flex:1 1 auto; min-height:0
│  ├─ .dsh-pp-list          flex:0 0 auto + max-height（listCap：非预览 10 行 / 预览 5 行）
│  └─ .dsh-pp-preview       flex:1 1 auto（唯一的弹性块，吃掉 body 剩余）
└─ .dsh-pp-hint            flex:0 0 auto + margin-top:auto（永远贴底）
```

- 回答区**不再写内联 height**，`previewHeight()`、`previewHeightPx` 状态与 ref 全部删除。
- 预览深度加面板高度规则：预览时面板 = `70vh`（夹在 360–1200px），非预览仍按内容封顶。

### 教训

> **能用布局表达的，就不要用 JS 算**。父 flex 里只要还有“会抢剩余空间”的兄弟，
> JS 写进去的 `height` 就只是一个愿望，浏览器按自己的规则分配后才算数。
> 排查这类问题的第一步应是**打印 DOM 结构与计算后的高度**，而不是改公式。

### 测试怎么锁

- `the answer region takes what the list and the hint row leave (R8/R9)`：body 为弹性，
  提问区 `flex:0 0`，回答区是唯一 `flex:1 1` 且**没有** `height` / `max-height`，提示行 `flex:0 0` + `margin-top:auto`。
- `the hint row sits outside the body region, after the answer`：源码守卫，提示行必须是 body 之后的兄弟节点。
- `the prompt list shows ten rows resting and five with the answer open (R8)`：`listCap` 与样式表行高一致。

---

## R14 — 空格、回答区、回复正文各判各的

### 现象

选中一条**还没有回答**的提问（刚发出、dsh 还在思考，或这一轮被中断），按空格会弹出回答区，
里面写着「没有找到回答」；另外，在设置里关掉「显示回答预览」后，焦点在搜索框上按空格仍可能
把回答区打开（打开与否取决于三条路径里哪条先判断）。

### 根因

「回答该不该显示」这件事被拆成了三处：

- 空格键：`setPreviewOpen((open) => !open)`，只看“有没有列表项”；
- 回答区渲染：`previewOpen && matches.length > 0`，**不看设置里的开关**；
- 回复正文 effect：只按 `previewOpen` 去取回复，取不到就显示“没有回答”。

三处的条件各不相同，于是同一次按键在不同路径上得出不同结论。

### 修复要点

- 一条纯函数 `previewBits({ open, enabled, matches, text })`：`shown` = 打开 && 设置允许 &&
  有列表项 && 有回复正文；`canOpen` = 设置允许 && 有列表项 && 有回复正文。
- 回答区、提示行、空格键全部只读这一个结果：空格关闭时关掉屏幕上的一切，打开时只有
  `canOpen` 才真正打开。
- `readReply`（“这条提问之后的回答”）导出给测试：已有测试只覆盖了行级文本，没有覆盖
  “选中的提问本身有没有回答”。

### 教训

> **同一个判断出现两次，就等于会出现两种答案。** 先把“该不该显示”收敛成一个纯函数并给它
> 列出所有输入（包括设置开关），再让每个界面去读它——这比在每个界面里补一个 `if` 可靠得多。
> 另外，`npm test` 全绿不代表真实行为正确：之前只有行级文本和布局结构的测试，
> “空格在无回答的提问上会打开空回答”这类**行为**从没被测过。

### 测试怎么锁

- `Space opens…`：无回复、无列表项、设置关闭三种情况都不得打开。
- `the answer area follows the same rule as the key`：打开后切换选中到无回复的提问、
  或设置中途关闭，回答区必须消失而不是留下空框。
- `the answer belongs to the selected prompt…`：`readReply` 不会把上一条提问的回答借给下一条。
- 源码守卫：只允许一处 `setPreviewOpen`，且必须调用 `previewBits`；面板里不得再出现
  `previewOpen && matches.length > 0` 这种旧判断。反向验证：把空格改回“只看列表长度”，
  或在面板里恢复旧判断，测试必须失败（本次已验过）。

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
| `listCap` | R8 / R13：提问区上限（非预览 10 行、预览 5 行），与样式表行高一致 |
| `previewBits` | R14：回答该不该显示（打开 / 设置开关 / 列表 / 有没有回复） |
| `readReply` | R14：某条提问之后的回答，不会借用上一条的 |
| `CSS` | R8 / R13：面板 / body / 列表 / 回答 / 提示行的 flex 分工（解析 CSS 断言） |
| `apply`（直接调用） | R10：重复注册 locale 字典时插件仍然挂载，`Ctrl+R` 的浮层照常注册 |
| `LocaleStub`（测试内） | R11：`subscribe` 依赖 `this`，裸传会让浮层渲染即崩 |
| `measurePanel`（源码守卫） | R9：测量在离屏克隆上做，且把回答框摘出克隆 |
| `panelHeight` | R9：非预览按内容封顶 `min(80vh,720px)`；预览固定 70vh（夹 360–1200px） |
| 全部 slot 组件（R12） | 各挂载面真实渲染一次：工厂函数漏传的自由变量（如 `bind`）会在这里炸出来 |

**改这些函数时，先跑测试；新增行为时，先写一条会在旧实现上失败的测试。**

```bash
npm test          # 49 个测试（客户端 36 + 宿主 13）
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
