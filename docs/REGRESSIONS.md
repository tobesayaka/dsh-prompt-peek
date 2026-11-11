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

## 用测试锁住这些问题的做法

`test/client.test.mjs` 不依赖浏览器：用 `vm` 跑 `src/client.js` 的模块工厂，取它返回的 `internals`。
`internals` 里都是纯函数，可被直接断言：

| 导出 | 用途 |
| --- | --- |
| `effectiveLanguage` / `translateKey` / `makeTranslate` | R1：语言解析与回退 |
| `pageDirection` / `pagePlan` | R2：按键决策表 |
| `glideFrame` / `glideStep` | R3：每帧步长的符号与距离 |

**改这些函数时，先跑测试；新增行为时，先写一条会在旧实现上失败的测试。**

```bash
npm test          # 25 个测试（宿主 10 + 客户端 15）
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
