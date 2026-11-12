window.__ModuleLoader__.load({
  id: 'dsh-prompt-peek',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /**
     * The shared code block from the host's primitive library. It tokenizes with
     * the app's own Shiki instance (loading grammars on demand) and installs the
     * copy and wrap controls, so the preview highlights code exactly like a chat
     * reply. Older hosts without that export keep the plain `<pre>` fallback.
     */
    let CodeBlock = null;
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
      if (primitives !== null && primitives !== undefined && typeof primitives.CodeBlock === 'function') {
        CodeBlock = primitives.CodeBlock;
      }
    } catch (error) {
      CodeBlock = null;
    }

    /** Copy and wrap captions used when no locale dictionary is available. */
    const CODE_LABELS = {
      copy: 'Copy',
      copied: 'Copied',
      code: 'Code',
      wrap: 'Wrap lines',
      unwrap: 'Unwrap lines',
    };

    const NS = 'dsh-prompt-peek';
    const SETTINGS_NS = NS + '.settings';
    const SETTINGS_ROUTE = '/api/prompt-peek.settings';
    const MAX_HISTORY = 300;
    const MAX_RESULTS = 50;
    /** Upper bound on older pages pulled before the panel opens (R5). */
    const MAX_OLDER_PAGES = 40;
    const MAX_REPLY = 6000;
    const REPLY_TAIL = 400;
    /** Line height of the preview's Markdown body; page distances are quoted in these lines. */
    const PREVIEW_LINE_HEIGHT = 18;
    /** Default page: about fifteen preview lines (270px at an 18px line height). */
    const PREVIEW_PAGE = 15 * PREVIEW_LINE_HEIGHT;
    /** Bounds of the "page distance" setting, in pixels: roughly 3 to 66 lines. */
    const PAGE_RANGE = [60, 1200];
    const PREVIEW_SCROLL_TAU = 100;
    /** The panel's height cap, matching `.dsh-pp-panel`'s `max-height`. */
    const PANEL_MAX = 720;
    /** `80vh`, the other half of the panel's cap, as a share. */
    const PANEL_MAX_VIEWPORT = 0.8;
    const EMPTY = [];
    /**
     * DSH's locale service owns the language choice: the user picks it once in
     * Settings → General → Language, and every plugin follows. The plugin has
     * no language setting of its own — a second switch could only disagree
     * with the rest of the window.
     */

    /**
     * Copy for hosts whose locale service has no dictionary yet, or whose
     * dictionary has not arrived. It is also the English entry registered with
     * `ctx.locale.register`, so a host without the service still gets working
     * copy instead of raw keys.
     */
    const BASE_DICTIONARY = {
      title: 'Search sent messages',
      placeholder: 'Type to filter…',
      empty: 'No matching messages',
      emptyShort: 'No results',
      hintSelect: 'select',
      hintPreview: 'preview',
      hintHidePreview: 'hide',
      hintTypeSpace: 'type space',
      hintPage: 'page',
      answerHit: 'reply match',
      hintWheel: 'scroll',
      hintInsert: 'insert',
      hintClose: 'cancel',
      keySpace: 'Space',
      previewTitle: "dsh's reply",
      previewMissing: 'No text reply is available in the loaded history.',
      previewOff: 'Reply preview is off',
      loadingOlder: 'Loading earlier prompts…',
      turnOn: 'turn on',
      copyCode: 'Copy',
      copiedCode: 'Copied',
      codeLabel: 'Code',
      wrapCode: 'Wrap lines',
      unwrapCode: 'Unwrap lines',
      browse: 'History',
      browseHint: '↑↓ browse · Esc exit',
      /** Where the plugin's page lives; named in the panel when its preview is off. */
      settingsLocation: 'Settings → Prompt peek',
    };

    /**
     * Copy for the plugin's Settings section (sidebar row, icon title, groups,
     * rows, buttons). Registered under `NS` itself, so the composer panel and
     * this page read one namespace and one key set.
     */
    const SETTINGS_DICTIONARY = {
      en: {
        settingsNav: 'Prompt peek',
        settingsLocation: 'Settings → Prompt peek',
        settingsTitle: 'Prompt peek',
        settingsIntro: 'Preferences for ↑ / ↓ recall, Ctrl+R search, and the Space preview. They only change this plugin, not the rest of DSH.',
        sectionBehavior: 'Behavior',
        showPreviewLabel: 'Show reply preview',
        showPreviewHint: 'Let Space reveal the reply that prompt received inside the search panel.',
        searchAnswersLabel: 'Also search replies',
        searchAnswersHint: 'Match the query against dsh\'s replies too. The list still shows your prompts; a row matched through its reply is marked "reply match".',
        smoothScrollLabel: 'Smooth paging',
        smoothScrollHint: 'Let PgUp / PgDn glide through the preview instead of jumping. Systems that ask for reduced motion always jump.',
        previewPageSizeLabel: 'Page distance',
        previewPageSizeValue: '{value} px',
        previewPageSizeHint: 'How far one PgUp or PgDn press moves the reply preview, in pixels. One mouse-wheel notch moves a quarter of that.',
        historyLimitLabel: 'History limit',
        historyLimitValue: '{value} prompts',
        historyLimitHint: 'Keep at most this many of the most recently sent prompts of the session.',
        browseOrderLabel: 'Result order',
        browseOrderHint: 'List matches oldest first, matching the ↑ / ↓ walk, or newest first like a shell history.',
        browseOrderOldest: 'Oldest first',
        browseOrderNewest: 'Newest first',
        save: 'Save',
        saving: 'Saving…',
        reset: 'Reset to profile defaults',
        saved: 'Saved',
        loadFailed: 'Could not read the settings.',
        saveFailed: 'Could not save the settings.',
        invalidValue: '{field}: enter a whole number between {min} and {max}.',
        readOnly: 'Settings are not editable in this profile.',
      },
      zh: {
        settingsNav: '输入框速览',
        settingsLocation: '设置 → 输入框速览',
        settingsTitle: '输入框速览',
        settingsIntro: '↑ / ↓ 翻历史、Ctrl+R 搜索、空格 预览回答时使用的偏好。只影响本插件，不改动 DSH 其他界面。',
        sectionBehavior: '行为',
        showPreviewLabel: '显示回答预览',
        showPreviewHint: '在搜索面板中按空格预览该提示词得到的回答。',
        searchAnswersLabel: '同时搜索回答',
        searchAnswersHint: '搜索关键词时也匹配 dsh 的回答；列表仍显示你的提问，命中的行会标出「回答命中」。',
        smoothScrollLabel: '平滑翻页',
        smoothScrollHint: 'PgUp / PgDn 平滑滚动预览，而不是直接跳动。已为减少动态效果的系统强制关闭。',
        previewPageSizeLabel: '每页滚动距离',
        previewPageSizeValue: '{value} px',
        previewPageSizeHint: 'PgUp / PgDn 一次滚动的距离（像素）；鼠标滚轮一格的滚动距离是这个值的四分之一。',
        historyLimitLabel: '历史条数上限',
        historyLimitValue: '{value} 条',
        historyLimitHint: '最多读取当前会话最近发送的多少条提示词。',
        browseOrderLabel: '结果顺序',
        browseOrderHint: '搜索列表从旧到新（与 ↑ / ↓ 翻阅方向一致），或像 Shell 那样从新到旧。',
        browseOrderOldest: '从旧到新',
        browseOrderNewest: '从新到旧',
        save: '保存',
        saving: '保存中…',
        reset: '恢复配置默认值',
        saved: '已保存',
        loadFailed: '无法读取设置。',
        saveFailed: '保存失败。',
        invalidValue: '{field}：请输入 {min} 到 {max} 之间的整数。',
        readOnly: '当前 profile 不可编辑设置。',
      },
    };

    /** The composer panel's copy in Chinese, key for key with {@link BASE_DICTIONARY}. */
    const PANEL_ZH = {
      title: '搜索已发送的消息',
      placeholder: '输入关键词…',
      empty: '没有匹配的消息',
      emptyShort: '无结果',
      hintSelect: '选择',
      hintPreview: '预览',
      hintHidePreview: '收起',
      hintTypeSpace: '输入空格',
      hintPage: '翻页',
      answerHit: '回答命中',
      hintWheel: '滚动',
      hintInsert: '填入',
      hintClose: '取消',
      keySpace: '空格',
      previewTitle: 'dsh 的回答',
      previewMissing: '这一条在已加载的记录里没有文字回复。',
      previewOff: '回答预览已关闭',
      loadingOlder: '正在加载更早的提示词…',
      turnOn: '重新开启',
      copyCode: '复制',
      copiedCode: '已复制',
      codeLabel: '代码',
      wrapCode: '自动换行',
      unwrapCode: '取消换行',
      browse: '历史',
      browseHint: '↑↓ 翻看 · Esc 退出',
      settingsLocation: '设置 → 输入框速览',
    };

    /** One namespace for everything this plugin renders: the panel copy plus the Settings page. */
    const DICTIONARY = {
      en: { ...BASE_DICTIONARY, ...SETTINGS_DICTIONARY.en },
      zh: { ...BASE_DICTIONARY, ...PANEL_ZH, ...SETTINGS_DICTIONARY.zh },
    };

    /**
     * Host fields that belong to a numeric row and its label.
     */
    const SETTING_LABEL_KEYS = {
      previewPageSize: 'previewPageSizeLabel',
      historyLimit: 'historyLimitLabel',
    };

    /**
     * Copy for the plugin's own surfaces.
     *
     * `bind` is the locale service's translate function for {@link NS}: it reads
     * DSH's active locale on every call, so a language switch reaches the
     * plugin without a remount. `translate` adds `{name}` interpolation for the
     * two rows that quote a number.
     * @param {(key: string) => string} bind
     */
    function translateKey(bind, key, params) {
      let text = '';
      try {
        text = String(bind(key) ?? key);
      } catch (error) {
        text = '';
      }
      // `bind` echoes the key when the namespace has no entry, and the setup
      // namespace answers `NS.key`-style keys; neither is copy.
      if (text === '' || text === key || text === NS + '.' + key) text = DICTIONARY.en[key] ?? key;
      if (params === undefined) return text;
      return text.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
    }


    const ROOT_STYLE = {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 'calc(100% + 8px)',
      zIndex: 70,
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 6,
    };

    const CSS = `
.dsh-pp-panel{pointer-events:auto;box-sizing:border-box;display:flex;flex-direction:column;gap:7px;padding:10px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;overflow:hidden;transition:height 140ms ease}
.dsh-pp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 2px}
.dsh-pp-title{color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;font-weight:500}
.dsh-pp-count{flex:none;border-radius:999px;padding:1px 8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:16px;font-variant-numeric:tabular-nums}
.dsh-pp-search{position:relative;display:flex;align-items:center}
.dsh-pp-search__icon{position:absolute;left:9px;width:13px;height:13px;color:var(--dsw-alias-label-secondary);pointer-events:none}
.dsh-pp-query{box-sizing:border-box;width:100%;height:34px;padding:0 10px 0 30px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}
.dsh-pp-query::placeholder{color:var(--dsw-alias-label-secondary)}
.dsh-pp-query:focus{border-color:var(--dsw-alias-brand-primary)}
.dsh-pp-list{position:relative;flex:1 1 auto;display:flex;flex-direction:column;gap:1px;min-height:calc(3 * 30px + 2px);overflow-y:auto;overscroll-behavior:contain;padding:1px 0}
.dsh-pp-row{flex:none;display:block;box-sizing:border-box;width:100%;height:30px;text-align:left;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;padding:5px 9px;border-radius:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.dsh-pp-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-pp-row[data-active="true"]{background:var(--dsw-alias-bg-layer-2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,var(--dsw-alias-bg-layer-2))}
.dsh-pp-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-pp-row__hit{margin-left:8px;padding:0 6px;border-radius:5px;font-size:11px;line-height:18px;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.dsh-pp-mark{background:var(--dsw-alias-bg-layer-2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent);color:inherit;border-radius:3px;padding:0 1px}
.dsh-pp-empty{padding:12px 8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dsh-pp-preview{flex:0 1 auto;min-height:0;max-height:40%;display:flex;flex-direction:column;overflow:hidden;overscroll-behavior:contain;margin-top:1px;padding:0 0 2px}
.dsh-pp-preview__title{flex:none;display:flex;align-items:center;gap:6px;box-sizing:border-box;width:calc(100% + 20px);margin:0 0 0 -10px;padding:6px 10px;border-bottom:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:16px;letter-spacing:.02em}
.dsh-pp-preview__title::before{content:"";width:5px;height:5px;border-radius:999px;background:var(--dsw-alias-brand-primary);opacity:.8}
.dsh-pp-preview__body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:6px 4px 0 2px;font-size:12px;line-height:18px}
.dsh-pp-preview__empty{flex:0 0 auto;overflow:hidden;padding:6px 4px 0 2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dsh-pp-hint{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:7px 2px 0;border-top:0.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dsh-pp-hint__group{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
.dsh-pp-hint__where{margin-left:auto;white-space:nowrap;border:0;padding:0;margin-top:0;margin-bottom:0;margin-right:0;background:none;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11px;line-height:16px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
@media (prefers-reduced-motion:reduce){.dsh-pp-panel{transition:none}}
.dsh-pp-kbd{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:1;font-family:inherit}
.dsh-pp-md{font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}
.dsh-pp-md__p{margin:0 0 6px;white-space:pre-wrap;word-break:break-word}
.dsh-pp-md__p:last-child{margin-bottom:0}
.dsh-pp-md__h{margin:10px 0 5px;font-weight:600;line-height:1.35;color:var(--dsw-alias-label-primary)}
.dsh-pp-md__h:first-child{margin-top:0}
.dsh-pp-md__h1{font-size:15px}
.dsh-pp-md__h2{font-size:14px}
.dsh-pp-md__h3{font-size:13px}
.dsh-pp-md__list{margin:0 0 6px;padding-left:18px}
.dsh-pp-md ul.dsh-pp-md__list{list-style:disc outside}
.dsh-pp-md ol.dsh-pp-md__list{list-style:decimal outside}
.dsh-pp-md__li{margin:1px 0;white-space:pre-wrap;word-break:break-word}
.dsh-pp-md__li--task{list-style:none;margin-left:-18px;display:flex;gap:5px;align-items:flex-start}
.dsh-pp-md__check{color:var(--dsw-alias-label-secondary);flex:none}
.dsh-pp-md__code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;padding:1px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);border:0.5px solid var(--dsw-alias-border-l1);white-space:pre-wrap;word-break:break-word}
.dsh-pp-md__pre{position:relative;margin:0 0 6px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-1);border:0.5px solid var(--dsw-alias-border-l1);overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:1.55;white-space:pre}
.dsh-pp-md__pre code{font:inherit;white-space:pre}
.dsh-pp-md__lang{position:absolute;top:4px;right:8px;font-size:9.5px;line-height:12px;color:var(--dsw-alias-label-secondary);opacity:.8;pointer-events:none;text-transform:lowercase;font-family:inherit}
.dsh-pp-md .dsh-pp-md__codeblock{--dsl-code-block-border-radius:8px;margin:0 0 6px}
.dsh-pp-md .dsh-pp-md__codeblock>:has(>[data-code-block-banner]){position:static;z-index:auto}
.dsh-pp-md .dsh-pp-md__codeblock [data-code-block-banner]{padding:4px 10px}
.dsh-pp-md .dsh-pp-md__codeblock pre{padding:8px 10px}
.dsh-pp-md__quote{margin:0 0 6px;padding:2px 0 2px 9px;border-left:2px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.dsh-pp-md__link{color:var(--dsw-alias-brand-primary);text-decoration:none}
.dsh-pp-md__link:hover{text-decoration:underline}
.dsh-pp-md__hr{border:0;border-top:0.5px solid var(--dsw-alias-border-l1);margin:9px 0}
.dsh-pp-md__table{width:100%;border-collapse:collapse;margin:0 0 6px;font-size:11.5px;line-height:16px}
.dsh-pp-md__th,.dsh-pp-md__td{border:0.5px solid var(--dsw-alias-border-l1);padding:3px 6px;text-align:left;vertical-align:top;word-break:break-word}
.dsh-pp-md__th{background:var(--dsw-alias-bg-layer-2);font-weight:600}
.dsh-pp-pill{align-self:flex-end;display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;width:max-content}
.dsh-pp-pill__dot{width:5px;height:5px;border-radius:999px;background:var(--dsw-alias-brand-primary)}
.dsh-pp-pill__count{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.dsh-pp-pill__hint{opacity:.75}
`;

    /** One keycap in the footer hint. */
    function keycap(label) {
      return h('kbd', { className: 'dsh-pp-kbd' }, label);
    }

    /** Collapse whitespace so one history entry stays on one row. */
    function previewOf(text) {
      const collapsed = String(text).replace(/\s+/gu, ' ').trim();
      return collapsed.length > 400 ? collapsed.slice(0, 400) + '…' : collapsed;
    }

    /** The composer card and its Lexical editor around the overlay entry. */
    function findComposer(root) {
      if (root === null || root === undefined) return null;
      let card = typeof root.closest === 'function' ? root.closest('[data-composer-card]') : null;
      if (card === null || card === undefined) {
        let el = root.parentElement;
        while (el !== null && el !== undefined && el !== document.body) {
          const candidate = el.querySelector('[data-lexical-editor="true"]')
            || el.querySelector('[contenteditable="true"]')
            || el.querySelector('[contenteditable]:not([contenteditable="false"])');
          if (candidate !== null && candidate !== undefined) {
            card = el;
            break;
          }
          el = el.parentElement;
        }
      }
      if (card === null || card === undefined) return null;
      const editor = card.querySelector('[data-lexical-editor="true"]')
        || card.querySelector('[contenteditable="true"]')
        || card.querySelector('[contenteditable]:not([contenteditable="false"])');
      if (editor === null || editor === undefined) return null;
      return { card, editor };
    }

    /**
     * Keep the newest `limit` prompts. The scan folds consecutive duplicates
     * before this trims, so the setting bounds what recall and search see rather
     * than how far back a duplicate run is folded.
     */
    function limitHistory(history, limit) {
      const bound = Number.isInteger(limit) && limit > 0 ? limit : MAX_HISTORY;
      return history.length > bound ? history.slice(history.length - bound) : history;
    }

    /** Joined non-empty `text` blocks of one message; reasoning and tool blocks are excluded. */
    function contentText(content) {
      if (!Array.isArray(content)) return '';
      const parts = [];
      for (const block of content) {
        if (block !== null && block !== undefined && block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
          parts.push(block.text.trim());
        }
      }
      return parts.join('\n\n');
    }

    /**
     * Every recorded message of the loaded event window, in event order.
     *
     * A human message is any `user/message` whose `data.source.kind` is `user`;
     * an assistant message is any event carrying `data.message.content` text
     * blocks. Nothing is classified by position, and events that are neither
     * (edits, replacements, tool calls) simply do not hide their neighbours, so
     * an answer keeps its prompt no matter what the Host interleaves.
     * @param {any} sessions the `sessions` service, or undefined
     * @param {string} sessionId
     * @returns {{ messages: ReadonlyArray<{ role: 'user' | 'assistant', seq: number, text: string }>, hasMore: boolean }}
     */
    function readMessages(sessions, sessionId) {
      const NONE = { messages: EMPTY, hasMore: false };
      if (sessions === undefined || sessions === null || sessionId === undefined || sessionId === null) return NONE;
      let binding;
      try {
        binding = sessions.binding(sessionId);
      } catch (error) {
        return NONE;
      }
      if (binding === undefined || binding === null) return NONE;
      const source = binding.eventSource;
      if (source === undefined || source === null || typeof source.getSnapshot !== 'function') return NONE;
      let snapshot;
      try {
        snapshot = source.getSnapshot();
      } catch (error) {
        return NONE;
      }
      if (snapshot === undefined || snapshot === null || !Array.isArray(snapshot.entries)) return NONE;
      const messages = [];
      for (const entry of snapshot.entries) {
        if (entry === null || entry === undefined || entry.type !== 'event') continue;
        const event = entry.event;
        if (event === null || event === undefined) continue;
        const data = event.data;
        if (data === null || data === undefined) continue;
        if (event.type === 'user/message') {
          if (data.source === null || data.source === undefined || data.source.kind !== 'user') continue;
          const text = contentText(data.content);
          if (text !== '') messages.push({ role: 'user', seq: event.seq, text });
          continue;
        }
        const message = data.message;
        if (message === null || message === undefined) continue;
        const text = contentText(message.content);
        if (text !== '') messages.push({ role: 'assistant', seq: event.seq, text });
      }
      return { messages, hasMore: snapshot.hasMore === true };
    }

    /** Human prompts in `messages`, counting consecutive duplicates once, like `readHistory`. */
    function promptCount(messages) {
      let count = 0;
      let previous = null;
      for (const message of messages) {
        if (message.role !== 'user' || message.text === previous) continue;
        previous = message.text;
        count += 1;
      }
      return count;
    }

    /** Wait for the next frame, so the Host's synchronous publish is visible. */
    function nextFrame() {
      return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
        else setTimeout(resolve, 0);
      });
    }

    /**
     * Bring the session's event window up to `limit` human prompts before the
     * panel (or ↑) reads it. The Host opens a session on one page and only
     * loads older turns when the transcript asks; without this the plugin
     * saw whatever page happened to be buffered (R5). Each step calls the
     * Session's public `loadOlder()`, which prepends to the same event window
     * `readMessages` reads, and stops when the limit is reached, the Host says
     * there is no older history, or a page adds nothing (a guard against a
     * Host that keeps claiming `hasMore` without progress).
     *
     * @param {any} sessions the `sessions` service
     * @param {string} sessionId
     * @param {number} limit history limit, in prompts
     * @param {() => Promise<void>} settle waits for the Host to publish the page
     * @returns {Promise<boolean>} whether the window actually grew
     */
    async function loadHistory(sessions, sessionId, limit, settle = nextFrame) {
      const before = readMessages(sessions, sessionId).messages.length;
      // The reported result is "this call grew the window", not "the window is
      // non-empty", so a second trigger on an already-loaded session does not
      // refresh a list that cannot have changed.
      let grew = false;
      let window = readMessages(sessions, sessionId);
      for (let page = 0; page < MAX_OLDER_PAGES; page += 1) {
        if (!window.hasMore || promptCount(window.messages) >= limit) break;
        let session;
        try {
          session = sessions.binding(sessionId).session;
        } catch (error) {
          return false;
        }
        if (session === undefined || session === null || typeof session.loadOlder !== 'function') return false;
        try {
          // Resolves once the page is published to the event window; the Host's
          // own `loadingOlder` guard drops a concurrent request, so a loop that
          // ends without progress below cannot spin.
          await session.loadOlder();
        } catch (error) {
          return false;
        }
        await settle();
        const next = readMessages(sessions, sessionId);
        if (next.messages.length <= window.messages.length && next.hasMore === window.hasMore) break;
        grew = true;
        window = next;
      }
      return grew && window.messages.length > before;
    }

    /**
     * Where the first frame of a glide is, and whether there is anything to do.
     * Every press starts from the reader's live position; a key repeat only
     * adds one page of lead on the glide already running, and a press against a
     * running glide turns it around. A press with no room left in its own
     * direction (measured against the scroll extent, never a same-sign offset)
     * asks the caller to stop instead of animating in place.
     * @param {{ scrollTop: number, scrollHeight: number, clientHeight: number }} metrics
     * @param {number} target the glide's current target, if one is running
     * @param {number} delta
     * @param {boolean} repeat
     * @returns {{ from: number, target: number, limit: number, atEdge: boolean }}
     */
    function glideFrame(metrics, target, delta, repeat) {
      const limit = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
      const position = Math.max(0, Math.min(limit, metrics.scrollTop));
      const direction = Math.sign(delta);
      const lead = target - position;
      // A key repeat keeps at most one page of lead on the glide it is holding:
      // repeating an existing target leaves it alone, and repeating against it
      // stops at the current position instead of swinging the other way.
      const next = repeat && Math.sign(lead) === direction && Math.abs(lead) > Math.abs(delta)
        ? target
        : position + delta;
      const clamped = Math.max(0, Math.min(limit, next));
      const edge = direction > 0 ? position >= limit - 0.5 : position <= 0.5;
      return { from: position, target: clamped, limit, atEdge: edge || clamped === position };
    }

    /**
     * One frame of the preview glide: how many whole pixels to move, signed in
     * the travel's own direction. `remaining` is signed (negative while moving
     * up); the sign must come from it, never from a rounded magnitude, or an
     * upward glide walks downward one pixel per frame.
     * @param {number} remaining target - scrollTop
     * @param {number} elapsed milliseconds since the previous frame
     * @param {number} [tau] easing time constant
     * @returns {number} pixels, never 0 unless `remaining` is already sub-pixel
     */
    function glideStep(remaining, elapsed, tau) {
      const time = Number.isFinite(tau) && tau > 0 ? tau : PREVIEW_SCROLL_TAU;
      const seconds = Number.isFinite(elapsed) ? Math.min(64, Math.max(0, elapsed)) : 0;
      const left = Math.abs(remaining);
      if (left < 1) return 0;
      const travel = Math.max(1, Math.floor(left * (1 - Math.exp(-seconds / time))));
      return Math.sign(remaining) * Math.min(travel, Math.ceil(left));
    }

    /** The keys that page the reply preview, and the direction each one travels. */
    function pageDirection(key) {
      if (key === 'PageDown') return 1;
      if (key === 'PageUp') return -1;
      return 0;
    }

    /**
     * What one `PgUp` / `PgDn` press does, decided without the DOM:
     *
     * - previews turned off in Settings: `none`, the key keeps its native meaning;
     * - no preview shown yet: `open` it, then page it once the scroller exists;
     * - room left in the travel direction: `scroll` one page;
     * - already at that edge: `edge`, the press is swallowed and stops there.
     *   Paging never moves the selection, so reading one reply never spills
     *   into the next prompt.
     *
     * @param {number} delta -1 for PgUp, 1 for PgDn, 0 for any other key
     * @param {boolean} previewVisible
     * @param {boolean} allowPreview
     * @param {boolean} atEdge
     * @returns {{ action: 'scroll' | 'open' | 'edge' | 'none', delta: number }}
     */
    function pagePlan(delta, previewVisible, allowPreview, atEdge) {
      if (delta === 0 || !allowPreview) return { action: 'none', delta };
      if (!previewVisible) return { action: 'open', delta };
      if (atEdge) return { action: 'edge', delta };
      return { action: 'scroll', delta };
    }

    /**
     * The height a box would take with `height:auto`, measured on an off-screen
     * clone so the box itself is never touched. Writing to the real element's
     * height (even to the same value) would cancel a transition already
     * planned for it, which is exactly what this measurement serves.
     *
     * @param {HTMLElement} element
     * @returns {number} content height in pixels, 0 when it cannot be measured
     */
    function naturalHeight(element) {
      if (element === null || element === undefined || typeof element.cloneNode !== 'function') return 0;
      const width = element.getBoundingClientRect().width;
      if (!(width > 0)) return 0;
      const clone = element.cloneNode(true);
      clone.removeAttribute('id');
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      clone.style.top = '0';
      clone.style.width = width + 'px';
      clone.style.height = 'auto';
      clone.style.transition = 'none';
      element.parentNode === null ? document.body.appendChild(clone) : element.parentNode.appendChild(clone);
      const height = clone.getBoundingClientRect().height;
      clone.remove();
      return Math.ceil(height);
    }

    /**
     * The panel's height as an explicit pixel value, or `null` for the
     * stylesheet's `auto`.
     *
     * A content-sized `height: auto` never animates when the content changes
     * (Chrome reports no running transition for a reply swap inside `auto`,
     * even with `interpolate-size: allow-keywords`). Writing the measured
     * height as a number instead makes every swap a `Npx → Mpx` change, which
     * the panel's `transition: height` does glide. The stylesheet keeps the
     * same ceiling, applied here because a number would otherwise ignore it.
     *
     * @param {{ open: boolean, content: number, viewport: number, reduced: boolean }} state
     * @returns {{ height: number | null, animate: boolean }}
     */
    function panelHeight({ open, content, viewport, reduced }) {
      if (!open || !(content > 0)) return { height: null, animate: false };
      const byViewport = viewport > 0 ? PANEL_MAX_VIEWPORT * viewport : PANEL_MAX;
      const ceiling = Math.min(byViewport, PANEL_MAX);
      return { height: Math.min(Math.ceil(content), ceiling), animate: reduced !== true };
    }

    /**
     * The index `↑` / `↓` moves to while browsing without the search panel: a
     * shell history walk. `-1` steps to the newer entry, `1` to the older one,
     * and both wrap around, so holding a key revisits every prompt forever.
     * `view` is the entry currently shown, or `-1` for the composer draft.
     *
     * @param {number} view
     * @param {number} delta -1 for `↑` (older), 1 for `↓` (newer)
     * @param {number} total
     * @returns {number} the next entry, or `-1` when stepping back onto the draft
     */
    function stepIndex(view, delta, total) {
      if (total <= 0) return -1;
      if (view < 0) return delta === -1 ? total - 1 : 0;
      const next = view + delta;
      if (next < 0) return total - 1;
      if (next >= total) return -1;
      return next;
    }

    /**
     * Which composer action a key event belongs to, decided without the DOM so
     * the boundary can be tested: `open-search` for `Ctrl+R` / `Cmd+R`, and
     * `null` for everything else. The caller only asks this after checking that
     * the key happened inside the composer's editor, so plain `Ctrl+R` in the
     * page at large still refreshes the browser.
     *
     * Modifiers other than the one carrier (`Shift`, `Alt`) or a second
     * `Ctrl`/`Meta` make it "not ours", as does an IME composition and a key
     * the page already consumed.
     *
     * @param {{ key?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, shiftKey?: boolean,
     *   defaultPrevented?: boolean, isComposing?: boolean, keyCode?: number }} event
     * @returns {'open-search' | null}
     */
    function ownsComposerKey(event) {
      if (event === null || event === undefined) return null;
      if (event.defaultPrevented === true || event.isComposing === true || event.keyCode === 229) return null;
      const key = typeof event.key === 'string' ? event.key : '';
      const carrier = event.metaKey === true ? 'meta' : 'ctrl';
      const other = event.metaKey === true && event.ctrlKey === true;
      if (other || event.altKey === true || event.shiftKey === true) return null;
      if ((carrier === 'meta' ? event.metaKey !== true : event.ctrlKey !== true)) return null;
      return key === 'r' || key === 'R' ? 'open-search' : null;
    }

    /**
     * The rows the search panel lists, with no DOM or React. `query` filters on
     * the prompt text; `searchAnswers` lets it also match the reply that
     * followed the prompt (this prompt up to the next human message). A row is
     * marked `answerHit` only when the prompt itself did not match, so the
     * badge always means "found through the reply".
     *
     * An empty query lists everything, oldest or newest first per `order`.
     *
     * @param {ReadonlyArray<{ lower: string, replyLower: string }>} items oldest first
     * @param {string} query raw query, trimmed and lower-cased here
     * @param {{ order?: 'newest' | 'oldest', searchAnswers?: boolean, limit?: number }} [options]
     * @returns {Array<any>}
     */
    function filterHistory(items, query, options = {}) {
      const needle = String(query === null || query === undefined ? '' : query).trim().toLowerCase();
      const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : items.length;
      const searchAnswers = options.searchAnswers === true;
      const source = options.order === 'oldest' ? items : items.slice().reverse();
      const found = [];
      for (let index = 0; index < source.length && found.length < limit; index += 1) {
        const item = source[index];
        if (needle === '' || item.lower.indexOf(needle) >= 0) {
          found.push({ ...item, answerHit: false });
          continue;
        }
        if (searchAnswers && String(item.replyLower ?? '').indexOf(needle) >= 0) found.push({ ...item, answerHit: true });
      }
      return found;
    }

    /**
     * One step of the history walk, with no DOM or React: `mode` is
     * `{ items, index, stash }` and `delta` is -1 for `↑`, 1 for `↓`, 0 to
     * leave the walk. Returns the next `mode` (`null` once the walk ends, so the
     * caller can write the walk back to the composer) and the draft the
     * composer must show.
     *
     * The stash — whatever the composer held when the walk began — is written
     * back on **every** exit path: leaving explicitly (`delta` 0) and stepping
     * newer past the newest entry both return it.
     *
     * @param {{ items: ReadonlyArray<{ text: string }>, index: number, stash: string }} mode
     * @param {number} delta
     * @returns {{ mode: { items: any, index: number, stash: string } | null, draft: string }}
     */
    function browseStep(mode, delta) {
      if (delta === 0) return { mode: null, draft: mode.stash };
      const next = stepIndex(mode.index, delta, mode.items.length);
      if (next === -1) return { mode: null, draft: mode.stash };
      return { mode: { items: mode.items, index: next, stash: mode.stash }, draft: mode.items[next].text };
    }

    /** Human messages actually sent in this session, oldest first, consecutive duplicates folded. */
    function readHistory(sessions, sessionId) {
      const messages = readMessages(sessions, sessionId).messages;
      const history = [];
      let previousText = null;
      for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        if (message.role !== 'user') continue;
        if (message.text === previousText) continue;
        previousText = message.text;
        history.push({
          key: 'h-' + String(message.seq),
          seq: message.seq,
          text: message.text,
          lower: message.text.toLowerCase(),
          // The reply this prompt produced, lower-cased for the optional
          // answer search. Only the assistant text blocks, up to the next
          // human message — tool calls and reasoning are not in `readMessages`.
          replyLower: replyTexts(messages, index).join('\n\n').toLowerCase(),
        });
      }
      return limitHistory(history, MAX_HISTORY);
    }

    /**
     * The assistant texts that sit after the human message at `start`, up to the
     * next human message: the whole reply, before the preview trims it.
     * @param {ReadonlyArray<{ role: string, text: string }>} messages
     * @param {number} start index of the human message
     * @returns {string[]}
     */
    function replyTexts(messages, start) {
      const texts = [];
      for (let index = start + 1; index < messages.length && texts.length < 200; index += 1) {
        const message = messages[index];
        if (message.role === 'user') break;
        texts.push(message.text);
      }
      return texts;
    }

    /**
     * The assistant text recorded after one sent message, up to the next human
     * message. `hold` is the row's own text: when the snapshot was rebuilt
     * between listing and previewing and `seq` moved, the text still finds the
     * prompt. The closing reply carries the answer; short tails pull in the
     * message before them.
     * @param {any} sessions
     * @param {string} sessionId
     * @param {number} seq
     * @param {{ text: string } | null} [hold]
     * @returns {{ text: string } | null}
     */
    function readReply(sessions, sessionId, seq, hold) {
      const messages = readMessages(sessions, sessionId).messages;
      const start = messages.findIndex((message) => message.role === 'user'
        && (message.seq === seq || (hold !== null && hold !== undefined && message.text === hold.text)));
      if (start < 0) return null;
      const texts = replyTexts(messages, start);
      if (texts.length === 0) return null;
      const chosen = [];
      let length = 0;
      for (let index = texts.length - 1; index >= 0 && length < REPLY_TAIL; index -= 1) {
        chosen.unshift(texts[index]);
        length += texts[index].length;
      }
      const text = chosen.join('\n\n');
      return { text: text.length > MAX_REPLY ? text.slice(0, MAX_REPLY) + '…' : text };
    }

    /** First match highlighted inside a collapsed preview. */
    function highlight(text, query) {
      const value = previewOf(text);
      if (query === '') return value;
      const index = value.toLowerCase().indexOf(query);
      if (index < 0) return value;
      return [
        value.slice(0, index),
        h('mark', { key: 'mark', className: 'dsh-pp-mark' }, value.slice(index, index + query.length)),
        value.slice(index + query.length),
      ];
    }

    /** Inline Markdown: code spans, bold, italic, strikethrough, and safe links. */
    function renderInline(text, prefix) {
      const pattern = /`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~\n]+~~|\[[^\]\n]*\]\([^)\s]+\)/gu;
      const out = [];
      let last = 0;
      let index = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) out.push(text.slice(last, match.index));
        const token = match[0];
        const key = prefix + '-i' + index;
        index += 1;
        if (token.charCodeAt(0) === 96) {
          out.push(h('code', { key, className: 'dsh-pp-md__code' }, token.slice(1, -1)));
        } else if (token.startsWith('**') || token.startsWith('__')) {
          out.push(h('strong', { key }, renderInline(token.slice(2, -2), key)));
        } else if (token.startsWith('~~')) {
          out.push(h('del', { key }, renderInline(token.slice(2, -2), key)));
        } else if (token.charCodeAt(0) === 91) {
          const link = /^\[([^\]]*)\]\(([^)\s]+)\)$/u.exec(token);
          const href = link === null ? null : safeHref(link[2]);
          if (href === null) out.push(token);
          else out.push(h('a', { key, className: 'dsh-pp-md__link', href, target: '_blank', rel: 'noreferrer noopener' }, renderInline(link[1], key)));
        } else {
          out.push(h('em', { key }, renderInline(token.slice(1, -1), key)));
        }
        last = match.index + token.length;
      }
      if (last < text.length) out.push(text.slice(last));
      if (out.length === 0) return '';
      return out.length === 1 ? out[0] : out;
    }

    function safeHref(raw) {
      const href = String(raw).trim();
      if (/^https?:\/\//iu.test(href) || /^mailto:/iu.test(href)) return href;
      if (href.startsWith('/') || href.startsWith('#')) return href;
      return null;
    }

    const MD_FENCE = /^```\s*([\w.+#-]*)\s*$/u;
    const MD_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;
    const MD_HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/u;
    const MD_QUOTE = /^\s*>\s?/u;
    const MD_UL = /^\s*[-*+]\s+(.*)$/u;
    const MD_OL = /^\s*(\d+)[.)]\s+(.*)$/u;
    const MD_TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/u;
    const MD_TASK = /^\[( |x|X)\]\s+(.*)$/u;

    function mdCells(line) {
      let body = line.trim();
      if (body.startsWith('|')) body = body.slice(1);
      if (body.endsWith('|')) body = body.slice(0, -1);
      return body.split('|').map((cell) => cell.trim());
    }

    function mdAlign(cell) {
      const left = cell.startsWith(':');
      const right = cell.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      return 'left';
    }

    function isMdBoundary(line) {
      return MD_FENCE.test(line) || MD_HEADING.test(line) || MD_HR.test(line) || MD_QUOTE.test(line) || MD_UL.test(line) || MD_OL.test(line);
    }

    /** One fenced block: the host's highlighted CodeBlock, or a plain `<pre>` on an older host. */
    function renderCodeBlock(block, key, labels) {
      if (CodeBlock === null) {
        return h('pre', { key, className: 'dsh-pp-md__pre' },
          block.lang === '' ? null : h('span', { className: 'dsh-pp-md__lang' }, block.lang),
          h('code', null, block.text));
      }
      const captions = labels === null || labels === undefined ? CODE_LABELS : labels;
      return h(CodeBlock, {
        key,
        className: 'dsh-pp-md__codeblock',
        code: block.text + '\n',
        lang: block.lang === '' ? undefined : block.lang,
        copyLabel: captions.copy,
        copiedLabel: captions.copied,
        toolbarLabels: {
          codeLabel: captions.code,
          wrapLabel: captions.wrap,
          unwrapLabel: captions.unwrap,
        },
      });
    }

    /**
     * Where the first match of `query` sits in a recorded prompt: the answer of
     * {@link previewWindow}, used to reveal the match inside a long, cut prompt.
     * @param {string} text
     * @param {string} query lower-cased query, or ''
     * @returns {{ offset: number } | null}
     */
    function matchAnchor(text, query) {
      const hit = query === '' ? -1 : String(text).toLowerCase().indexOf(query);
      // Absolute offset into `text`; each renderer maps it into its own window,
      // so a short reply and a cut one share this single value.
      return hit < 0 ? null : { offset: hit };
    }

    /**
     * The window of a long prompt the preview shows: at most `MAX_REPLY`
     * characters, normally its last `REPLY_TAIL`, widened backwards when the
     * first match lies earlier, and never starting with a broken line.
     * @param {string} text
     * @param {number} hit offset of the first match, or -1
     * @returns {{ start: number, text: string }}
     */
    function previewWindow(text, hit) {
      const source = String(text);
      if (source.length <= MAX_REPLY) return { start: 0, text: source };
      let start = Math.max(0, source.length - REPLY_TAIL);
      const earliest = source.length - MAX_REPLY;
      if (hit >= 0 && hit < start) start = Math.max(earliest, Math.min(start, hit - REPLY_TAIL));
      if (start > 0) {
        const line = source.indexOf('\n', start);
        if (line >= 0 && source.length - line > REPLY_TAIL) start = line + 1;
      }
      return { start, text: source.slice(start) };
    }

    /**
     * Markdown block boundaries: source offset ranges, in render order — the
     * same walk the renderer takes below. The renderer draws one element per
     * block, so these ranges also say which element holds a given offset.
     * @param {ReadonlyArray<string>} lines
     * @returns {ReadonlyArray<[number, number]>} inclusive offset ranges
     */
    function markdownSpans(lines) {
      const spans = [];
      const cursor = { start: 0, index: 0 };
      const advance = () => {
        const end = cursor.start + lines[cursor.index].length;
        cursor.start = end + 1;
        cursor.index += 1;
        return end;
      };
      while (cursor.index < lines.length) {
        const line = lines[cursor.index];
        const lineStart = cursor.start;
        let end = lineStart + line.length;
        cursor.start = end + 1;
        cursor.index += 1;
        if (line.trim() === '') continue;
        if (MD_FENCE.test(line)) {
          while (cursor.index < lines.length && !/^```\s*$/u.test(lines[cursor.index])) end = advance();
          if (cursor.index < lines.length) end = advance();
        } else if (MD_QUOTE.test(line)) {
          while (cursor.index < lines.length && MD_QUOTE.test(lines[cursor.index])) end = advance();
        } else if (cursor.index < lines.length && line.includes('|') && MD_TABLE_SEP.test(lines[cursor.index])) {
          end = advance();
          while (cursor.index < lines.length && lines[cursor.index].trim() !== '' && lines[cursor.index].includes('|')) end = advance();
        } else if (MD_UL.test(line)) {
          while (cursor.index < lines.length && MD_UL.test(lines[cursor.index])) end = advance();
        } else if (MD_OL.test(line)) {
          while (cursor.index < lines.length && MD_OL.test(lines[cursor.index])) end = advance();
        } else if (!MD_HEADING.test(line) && !MD_HR.test(line)) {
          while (cursor.index < lines.length && lines[cursor.index].trim() !== '' && !isMdBoundary(lines[cursor.index])) end = advance();
        }
        spans.push([lineStart, end]);
      }
      return spans;
    }

    /**
     * Index of the block holding character `offset`, or -1 when the offset
     * falls between blocks (blank lines).
     * @param {ReadonlyArray<[number, number]>} spans from {@link markdownSpans}
     * @param {number} offset
     */
    function markdownBlockAt(spans, offset) {
      for (let index = 0; index < spans.length; index += 1) {
        const [from, to] = spans[index];
        if (offset >= from && offset <= to) return index;
        if (offset < from) return -1;
      }
      return -1;
    }

    /**
     * Compact Markdown renderer for recorded replies: no HTML, links restricted
     * to http(s), mailto, and anchors. `options.labels` overrides the code-block
     * captions; `options.focus` (`{ offset }`) marks the block holding that
     * character offset so the preview can scroll to the first match.
     */
    function renderMarkdown(source, options) {
      const labels = options === null || options === undefined ? null : options.labels;
      const focusOffset = options !== null && options !== undefined && options.focus !== null && options.focus !== undefined
        && typeof options.focus.offset === 'number'
        ? options.focus.offset
        : null;
      const text = String(source).replace(/\r\n?/gu, '\n');
      const lines = text.split('\n');
      const focus = focusOffset === null ? -1 : markdownBlockAt(markdownSpans(lines), focusOffset);
      const blocks = [];
      let index = 0;
      while (index < lines.length) {
        const line = lines[index];
        if (line.trim() === '') {
          index += 1;
          continue;
        }
        const fence = MD_FENCE.exec(line);
        if (fence !== null) {
          const lang = fence[1];
          const code = [];
          index += 1;
          while (index < lines.length && !/^```\s*$/u.test(lines[index])) {
            code.push(lines[index]);
            index += 1;
          }
          index += 1;
          blocks.push({ type: 'code', lang, text: code.join('\n') });
          continue;
        }
        const heading = MD_HEADING.exec(line);
        if (heading !== null) {
          blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
          index += 1;
          continue;
        }
        if (MD_HR.test(line)) {
          blocks.push({ type: 'hr' });
          index += 1;
          continue;
        }
        if (MD_QUOTE.test(line)) {
          const body = [];
          while (index < lines.length && MD_QUOTE.test(lines[index])) {
            body.push(lines[index].replace(MD_QUOTE, ''));
            index += 1;
          }
          blocks.push({ type: 'quote', text: body.join('\n') });
          continue;
        }
        if (index + 1 < lines.length && line.includes('|') && MD_TABLE_SEP.test(lines[index + 1])) {
          const head = mdCells(line);
          const aligns = mdCells(lines[index + 1]).map(mdAlign);
          const rows = [];
          index += 2;
          while (index < lines.length && lines[index].trim() !== '' && lines[index].includes('|')) {
            rows.push(mdCells(lines[index]));
            index += 1;
          }
          blocks.push({ type: 'table', head, aligns, rows });
          continue;
        }
        const unordered = MD_UL.exec(line);
        if (unordered !== null) {
          const items = [];
          while (index < lines.length) {
            const item = MD_UL.exec(lines[index]);
            if (item === null) break;
            items.push(item[1]);
            index += 1;
          }
          blocks.push({ type: 'list', ordered: false, items });
          continue;
        }
        const ordered = MD_OL.exec(line);
        if (ordered !== null) {
          const items = [];
          while (index < lines.length) {
            const item = MD_OL.exec(lines[index]);
            if (item === null) break;
            items.push(item[2]);
            index += 1;
          }
          blocks.push({ type: 'list', ordered: true, items });
          continue;
        }
        const paragraph = [];
        while (index < lines.length && lines[index].trim() !== '' && !isMdBoundary(lines[index])) {
          paragraph.push(lines[index]);
          index += 1;
        }
        blocks.push({ type: 'p', text: paragraph.join('\n') });
      }

      const children = blocks.map((block, blockIndex) => {
        const key = 'md' + blockIndex;
        const mark = focus === blockIndex ? ' dsh-pp-md__focus' : '';
        if (block.type === 'code') {
          return renderCodeBlock(block, key, labels);
        }
        if (block.type === 'heading') {
          const level = Math.min(block.level, 3);
          return h('div', { key, className: 'dsh-pp-md__h dsh-pp-md__h' + level + mark }, renderInline(block.text, key));
        }
        if (block.type === 'hr') return h('hr', { key, className: 'dsh-pp-md__hr' });
        if (block.type === 'quote') return h('blockquote', { key, className: 'dsh-pp-md__quote' }, renderInline(block.text, key));
        if (block.type === 'list') {
          const items = block.items.map((item, itemIndex) => {
            const itemKey = key + '-' + itemIndex;
            const task = MD_TASK.exec(item);
            if (task === null) return h('li', { key: itemKey, className: 'dsh-pp-md__li' }, renderInline(item, itemKey));
            return h('li', { key: itemKey, className: 'dsh-pp-md__li dsh-pp-md__li--task' },
              h('span', { className: 'dsh-pp-md__check', 'aria-hidden': true }, task[1].toLowerCase() === 'x' ? '☑' : '☐'),
              renderInline(task[2], itemKey));
          });
          return block.ordered
            ? h('ol', { key, className: 'dsh-pp-md__list' }, items)
            : h('ul', { key, className: 'dsh-pp-md__list' }, items);
        }
        if (block.type === 'table') {
          const head = h('tr', null, block.head.map((cell, cellIndex) => h('th', {
            key: 'h' + cellIndex,
            className: 'dsh-pp-md__th',
            style: { textAlign: block.aligns[cellIndex] || 'left' },
          }, renderInline(cell, key + 'h' + cellIndex))));
          const rows = block.rows.map((row, rowIndex) => h('tr', { key: 'r' + rowIndex }, row.map((cell, cellIndex) => h('td', {
            key: 'c' + cellIndex,
            className: 'dsh-pp-md__td',
            style: { textAlign: block.aligns[cellIndex] || 'left' },
          }, renderInline(cell, key + 'r' + rowIndex + 'c' + cellIndex)))));
          return h('table', { key, className: 'dsh-pp-md__table' }, h('thead', null, head), h('tbody', null, rows));
        }
        return h('p', { key, className: 'dsh-pp-md__p' + mark }, renderInline(block.text, key));
      });
      return h('div', { className: 'dsh-pp-md' }, children);
    }

    /** Id of this plugin's Settings section and sidebar row. */
    const SETTING_TAB_ID = 'prompt-peek';

    /** Numeric bounds the Settings page enforces before it saves, mirroring the host. */
    const SETTING_LIMITS = {
      previewPageSize: PAGE_RANGE,
      historyLimit: [20, 1000],
    };
    /** The globe used by the sidebar's and the nav row's language control. */
    function GlobeIcon(props) {
      const size = props !== null && props !== undefined && typeof props.size === 'number' ? props.size : 16;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      },
      h('circle', { cx: 8, cy: 8, r: 5.6, stroke: 'currentColor', strokeWidth: 1.3 }),
      h('path', {
        d: 'M2.6 8h10.8M8 2.4c1.7 1.5 2.6 3.4 2.6 5.6S9.7 12.1 8 13.6C6.3 12.1 5.4 10.2 5.4 8S6.3 3.9 8 2.4Z',
        stroke: 'currentColor',
        strokeWidth: 1.1,
      }));
    }

    /** The light switch used by the General section's built-in rows. */
    function Toggle(props) {
      const { label, checked, disabled, onChange } = props;
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked === true,
        'aria-label': label,
        disabled,
        onClick: () => onChange(checked !== true),
        style: {
          position: 'relative',
          flex: 'none',
          width: 36,
          height: 20,
          padding: 0,
          border: 'none',
          borderRadius: 999,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          background: checked === true
            ? 'var(--dsw-alias-brand-primary)'
            : 'var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2))',
          transition: 'background-color 120ms ease',
        },
      }, h('span', {
        style: {
          position: 'absolute',
          top: 2,
          left: 2,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
          transform: checked === true ? 'translateX(16px)' : 'none',
          transition: 'transform 120ms ease',
        },
      }));
    }

    /**
     * The plugin's page, a top-level Settings section of its own (like Models or
     * Shell), built from the same row anatomy as the built-in General rows: a
     * title/description stack on the left and one control on the right, separated
     * by a hairline. Language gets its own group at the top and is applied as
     * soon as it is chosen; the behavior switches and their numbers are saved
     * together, because they are one policy.
     */
    function createSettingsPage(ctx, store, bind, useSettings, useLocaleRevision) {
      const PAGE = {
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 720,
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 14,
        lineHeight: '22px',
      };
      const ROW = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        padding: '16px 0',
        borderBottom: '0.5px solid var(--dsw-alias-border-l1)',
      };
      const STACK = { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 };
      const TITLE = { fontSize: 14, lineHeight: '20px', color: 'var(--dsw-alias-label-primary)' };
      const DESC = { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' };
      const VALUE = { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums' };
      const GROUP_TITLE = {
        fontSize: 11,
        lineHeight: '16px',
        fontWeight: 600,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-secondary)',
        padding: '18px 0 2px',
      };
      const SELECT = {
        boxSizing: 'border-box',
        height: 32,
        padding: '0 8px',
        borderRadius: 8,
        border: '0.5px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 13,
        width: 220,
      };
      const ACTIONS = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '18px 0 4px' };
      const BUTTON = {
        boxSizing: 'border-box',
        height: 32,
        padding: '0 14px',
        borderRadius: 8,
        border: '1px solid transparent',
        fontFamily: 'inherit',
        fontSize: 13,
        lineHeight: '20px',
        fontWeight: 500,
        cursor: 'pointer',
      };
      const PRIMARY = {
        ...BUTTON,
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary))',
        color: 'var(--dsw-alias-label-primary-foreground, #fff)',
      };
      const SECONDARY = {
        ...BUTTON,
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '0.5px solid var(--dsw-alias-border-l1)',
        color: 'var(--dsw-alias-label-primary)',
      };
      const STATUS = { fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' };
      const ERROR = { ...STATUS, color: 'var(--dsw-alias-state-error-primary, var(--dsw-alias-label-primary))' };
      const DEFAULTS = {
        showPreview: true,
        searchAnswers: false,
        smoothScroll: true,
        previewPageSize: PREVIEW_PAGE,
        historyLimit: 300,
        browseOrder: 'newest',
      };

      return function PromptPeekSettings() {
        useSettings();
        useLocaleRevision();
        const state = store.get();
        // The page's copy comes from the locale service on every render, so the
        // DSH language reaches it live; `draft` only holds unsaved edits.
        const draft = React.useState(null);
        const t = (key) => translateKey(bind, key);
        const label = (key) => {
          const field = SETTING_LABEL_KEYS[key];
          return field === undefined ? key : t(field);
        };
        // `values` re-reads the store whenever its revision moves (a save, the
        // first load, or a DSH language switch); `draft` holds unsaved edits.
        const values = React.useMemo(() => state.values, [state.revision]);

        const setDraft = draft[1];
        const [saving, setSaving] = React.useState(false);
        const [error, setError] = React.useState('');
        const [notice, setNotice] = React.useState('');
        const [editable, setEditable] = React.useState(true);
        const [path, setPath] = React.useState('');

        React.useEffect(() => {
          const controller = new AbortController();
          let cancelled = false;
          void (async () => {
            try {
              const response = await fetch(SETTINGS_ROUTE, { signal: controller.signal, cache: 'no-store' });
              const data = await response.json().catch(() => null);
              if (cancelled) return;
              if (!response.ok || data === null || typeof data.values !== 'object') {
                setError(t('loadFailed'));
                return;
              }
              store.set(data.values);
              setEditable(data.editable !== false);
              setPath(typeof data.path === 'string' ? data.path : '');
            } catch (failure) {
              if (cancelled || (failure !== null && failure !== undefined && failure.name === 'AbortError')) return;
              setError(t('loadFailed'));
            }
          })();
          return () => {
            cancelled = true;
            controller.abort();
          };
        }, []);

        const current = draft[0] ?? values;
        const baseline = current ?? DEFAULTS;
        const update = (key, value) => {
          setDraft({ ...values, ...(draft[0] ?? {}), [key]: value });
          setError('');
          setNotice('');
        };

        const post = async (body, onSaved) => {
          setSaving(true);
          setError('');
          setNotice('');
          try {
            const response = await fetch(SETTINGS_ROUTE, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || data === null || typeof data.values !== 'object') {
              const range = data !== null && data !== undefined && data.error === 'out_of_range'
                ? SETTING_LIMITS[data.field]
                : undefined;
              setError(range === undefined
                ? t('saveFailed')
                : t('invalidValue')
                  .replace('{field}', label(data.field))
                  .replace('{min}', String(range[0]))
                  .replace('{max}', String(range[1])));
              return;
            }
            store.set(data.values);
            setDraft(null);
            if (onSaved === undefined) setNotice(t('saved'));
            else onSaved();
          } catch (failure) {
            setError(t('saveFailed'));
          } finally {
            setSaving(false);
          }
        };

        const settingsPatch = (source) => {
          const patch = {};
          for (const key of Object.keys(SETTING_LIMITS)) {
            const range = SETTING_LIMITS[key];
            const number = Number(source[key]);
            patch[key] = Number.isInteger(number) && number >= range[0] && number <= range[1] ? number : DEFAULTS[key];
          }
          patch.showPreview = source.showPreview !== false;
          patch.smoothScroll = source.smoothScroll !== false;
          patch.browseOrder = source.browseOrder === 'oldest' ? 'oldest' : 'newest';
          return patch;
        };

        const save = () => {
          for (const key of Object.keys(SETTING_LIMITS)) {
            const range = SETTING_LIMITS[key];
            const number = Number(baseline[key]);
            if (!Number.isInteger(number) || number < range[0] || number > range[1]) {
              setError(t('invalidValue')
                .replace('{field}', label(key))
                .replace('{min}', String(range[0]))
                .replace('{max}', String(range[1])));
              return;
            }
          }
          void post({ values: settingsPatch(baseline) });
        };

        const reset = () => {
          void post({ reset: true });
        };

        const disabled = saving || !editable;

        const switchRow = (rowLabel, hint, checked, onToggle) => h('div', { style: ROW },
          h('div', { style: STACK },
            h('div', { style: TITLE }, rowLabel),
            h('div', { style: DESC }, hint),
          ),
          h(Toggle, { label: rowLabel, checked, disabled, onChange: onToggle }),
        );

        const selectRow = (rowLabel, hint, value, options, onChange) => h('div', { style: ROW },
          h('div', { style: STACK },
            h('div', { style: TITLE }, rowLabel),
            h('div', { style: DESC }, hint),
          ),
          h('select', {
            value,
            'aria-label': rowLabel,
            disabled,
            onChange: (event) => onChange(event.target.value),
            style: SELECT,
          }, options.map((option) => h('option', { key: option.value, value: option.value }, option.label))),
        );

        const rangeRow = (key) => {
          const range = SETTING_LIMITS[key];
          const value = Number(baseline[key]);
          const shown = Number.isFinite(value) ? value : range[0];
          return h('div', { style: ROW },
            h('div', { style: STACK },
              h('div', { style: TITLE }, label(key)),
              h('div', { style: DESC }, t(key === 'previewPageSize' ? 'previewPageSizeHint' : 'historyLimitHint')),
            ),
            h('div', { style: { ...STACK, flex: 'none', alignItems: 'flex-end', gap: 2 } },
              h('div', { style: VALUE }, t(key === 'previewPageSize' ? 'previewPageSizeValue' : 'historyLimitValue')
                .replace('{value}', String(shown))),
              h('input', {
                type: 'range',
                min: range[0],
                max: range[1],
                step: key === 'previewPageSize' ? 20 : 10,
                value: shown,
                'aria-label': label(key),
                disabled,
                onChange: (event) => update(key, Number(event.target.value)),
                style: { width: 220, margin: 0 },
              }),
            ),
          );
        };

        const group = (title, rows) => h('div', { style: { display: 'flex', flexDirection: 'column' } },
          h('div', { style: GROUP_TITLE }, title),
          rows,
        );

        if (current === null && error !== '') {
          return h('div', { style: { padding: '18px 0', ...PAGE } },
            h('div', { style: { ...TITLE, fontSize: 16, fontWeight: 600 } }, t('settingsTitle')),
            h('div', { style: ERROR, role: 'alert' }, error),
          );
        }

        return h('div', { style: PAGE },
          h('div', { style: { padding: '6px 0 12px' } },
            h('div', { style: { fontSize: 16, lineHeight: '24px', fontWeight: 600 } }, t('settingsTitle')),
            h('div', { style: DESC }, t('settingsIntro')),
          ),
          group(t('sectionBehavior'), [
            switchRow(t('showPreviewLabel'), t('showPreviewHint'), baseline.showPreview !== false, (value) => update('showPreview', value)),
            switchRow(t('searchAnswersLabel'), t('searchAnswersHint'), baseline.searchAnswers === true, (value) => update('searchAnswers', value)),
            switchRow(t('smoothScrollLabel'), t('smoothScrollHint'), baseline.smoothScroll !== false, (value) => update('smoothScroll', value)),
            rangeRow('previewPageSize'),
            rangeRow('historyLimit'),
            selectRow(
              t('browseOrderLabel'),
              t('browseOrderHint'),
              baseline.browseOrder === 'oldest' ? 'oldest' : 'newest',
              [
                { value: 'oldest', label: t('browseOrderOldest') },
                { value: 'newest', label: t('browseOrderNewest') },
              ],
              (value) => update('browseOrder', value),
            ),
          ]),
          !editable ? h('div', { style: { ...STATUS, paddingTop: 12 } }, t('readOnly')) : null,
          h('div', { style: ACTIONS },
            h('button', {
              type: 'button',
              disabled,
              onClick: save,
              style: disabled ? { ...PRIMARY, opacity: 0.6, cursor: 'default' } : PRIMARY,
            }, saving ? t('saving') : t('save')),
            h('button', {
              type: 'button',
              disabled,
              onClick: reset,
              style: disabled ? { ...SECONDARY, opacity: 0.6, cursor: 'default' } : SECONDARY,
            }, t('reset')),
            notice !== '' ? h('span', { style: STATUS, role: 'status' }, notice) : null,
            error !== '' ? h('span', { style: ERROR, role: 'alert' }, error) : null,
          ),
          path === '' ? null : h('div', { style: { ...DESC, paddingBottom: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }, path),
        );
      };
    }

    return {
      /**
       * Pure helpers, reachable from `test/` without a browser or a slot
       * runtime: the client entry runs its factory at load, and the module
       * loader hands the result back to Node. Nothing here touches `window`,
       * `document`, or a live ctx.
       */
      internals: Object.freeze({
        DICTIONARY,
        NS,
        translateKey,
        pageDirection,
        pagePlan,
        stepIndex,
        browseStep,
        filterHistory,
        ownsComposerKey,
        readMessages,
        readHistory,
        promptCount,
        loadHistory,
        glideFrame,
        glideStep,
        panelHeight,
        CSS,
      }),
      inject: ['slots', 'locale'],
      apply(ctx) {
        const refreshableSessions = () => ctx.get('sessions');
        /**
         * The plugin's settings document, mirrored for every surface that reads
         * it: the search panel, animated pill, and Settings page all render from
         * this one store, so a save applies everywhere at once.
         *
         * Values come from the Host document and profile baseline when the shell
         * exposes them, then from edits saved on the Settings page during this
         * session (`savedOverrides`), then from the documented defaults. The
         * revision bumps on each save and each DSH locale move.
         */
        const savedOverrides = {};
        const readSetting = (key) => savedOverrides[key];
        /** Paging step for the reply preview; the wheel moves a quarter page per notch. */
        const pagePager = (values) => {
          const configured = values !== null && values !== undefined && Number.isInteger(values.previewPageSize)
            ? values.previewPageSize
            : PREVIEW_PAGE;
          return {
            /** Pixels per `PgUp` / `PgDn` and per wheel notch (a notch is a quarter page). */
            page: configured,
            smooth: values === null || values === undefined || values.smoothScroll !== false,
          };
        };
        /**
         * Turn the reply preview back on from the search panel, then save it like
         * the Settings page would. The panel updates at once; a failed save
         * leaves the setting at its stored value after the next reload.
         */
        const enablePreview = () => {
          savedOverrides.showPreview = true;
          settingsStore.refresh();
          // Save like the Settings page does, keeping the other fields at their
          // stored values; if the save is refused the local value is rolled back
          // so the panel and the file never disagree.
          const patch = { ...settingsStore.get().values, showPreview: true };
          void fetch(SETTINGS_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ values: patch }),
          }).then(async (response) => {
            const data = await response.json().catch(() => null);
            if (!response.ok || data === null || typeof data.values !== 'object') throw new Error('rejected');
            savedOverrides.showPreview = data.values.showPreview !== false;
            settingsStore.refresh();
          }).catch((error) => {
            savedOverrides.showPreview = false;
            settingsStore.refresh();
            console.error('prompt-peek: could not turn the reply preview back on', error);
          });
        };

        /** The copy for the composer surfaces, readable from key handlers as well as render. */
        const bind = ctx.locale.bind(NS);

        /**
         * The plugin's settings document, mirrored for every surface that reads
         * it: the search panel, animated pill, and Settings page all render from
         * this one snapshot, so a save applies everywhere at once.
         */
        const settingsStore = (() => {
          // Read through to the Host document on every access, so the page and
          // the composer never disagree about a value. The revision is the only
          // stored state: it bumps on a save and on a DSH locale move.
          const state = {
            get values() {
              const value = (key) => {
                const saved = readSetting(key);
                if (saved !== undefined) return saved;
                // Optional context values: a Host that mirrors its settings into
                // the client may expose the saved document and the profile
                // baseline. Absent (as on the stock Host) the defaults below win.
                const baseline = ctx.get('settingFallback');
                if (baseline !== null && baseline !== undefined && baseline[key] !== undefined) return baseline[key];
                const host = ctx.get('storedSettings');
                if (host !== null && host !== undefined && host[key] !== undefined) return host[key];
                return undefined;
              };
              return {
                showPreview: value('showPreview') !== false,
                searchAnswers: value('searchAnswers') === true,
                smoothScroll: value('smoothScroll') !== false,
                previewPageSize: value('previewPageSize') ?? PREVIEW_PAGE,
                historyLimit: value('historyLimit') ?? MAX_HISTORY,
                browseOrder: value('browseOrder') ?? 'newest',
              };
            },
            revision: 0,
          };
          const listeners = new Set();
          const notify = () => {
            state.revision += 1;
            for (const listener of [...listeners]) {
              try {
                listener();
              } catch (error) {
                console.error('prompt-peek: a settings subscriber crashed', error);
              }
            }
          };
          return {
            get: () => state,
            /** Apply a saved (or loaded) document and refresh every surface. */
            set(next) {
              Object.assign(savedOverrides, next);
              notify();
            },
            /** Republish after DSH's own locale moved (the copy is read live; this re-renders). */
            sync: notify,
            /** Republish after a surface edited the document outside the page. */
            refresh: notify,
            subscribe(listener) {
              listeners.add(listener);
              return () => {
                listeners.delete(listener);
              };
            },
          };
        })();
        ctx.effect(() => ctx.locale.subscribe(() => settingsStore.sync()), 'prompt-peek: follow the DSH locale');
        /** One setting, exactly as the store sees it (saved override, then Host document). */
        const readNow = (key) => settingsStore.get().values[key];
        const useSettings = () => React.useSyncExternalStore(
          React.useCallback((notify) => settingsStore.subscribe(notify), []),
          () => settingsStore.get().revision,
          () => 0,
        );
        /**
         * Re-render on DSH locale changes. `bind` reads the active locale per
         * call, so the revision is only what tells React to render again —
         * on a language switch or a late dictionary registration.
         *
         * The service's `subscribe` is a class method that touches
         * `this.listeners`; handing it to React bare would call it with
         * `this === undefined` and throw inside the composer overlay.
         */
        const useLocaleRevision = () => React.useSyncExternalStore(
          (notify) => ctx.locale.subscribe(notify),
          () => ctx.locale.getSnapshot().revision,
          () => 0,
        );

        // Both baseline languages in one call. The service throws on a
        // duplicate namespace/locale (a reload of this plugin alone), and the
        // earlier registration stays in force. That throw must not escape:
        // `apply` registers the slot below it, so letting it out unmounts the
        // whole plugin and `Ctrl+R` stops answering.
        ctx.effect(() => {
          try {
            return ctx.locale.register(NS, DICTIONARY);
          } catch (error) {
            console.warn('prompt-peek: dictionaries already registered, keeping the earlier copy', error);
            return () => {};
          }
        }, 'prompt-peek: dictionaries');

        function ComposerHistory(props) {
          const inputActions = props.inputActions;
          const useInput = typeof props.useInput === 'function'
            ? props.useInput
            : (select) => select({ draft: '', phase: 'plain' });
          const draft = useInput((state) => (state === undefined || state === null ? "" : state.draft));
          const phase = useInput((state) => (state === undefined || state === null ? "plain" : state.phase));

          // Settings changes (language, preview, paging) and DSH locale changes
          // both re-render this overlay; the translate below reads the current
          // language preference, not a snapshot captured at mount.
          useSettings();
          useLocaleRevision();
          const translate = (key) => translateKey(bind, key);

          const rootRef = React.useRef(null);
          const panelRef = React.useRef(null);
          const previewRef = React.useRef(null);
          const scrollAnimRef = React.useRef({ frame: 0, target: 0, repeat: false, direction: 0 });
          const inputRef = React.useRef(null);
          const listRef = React.useRef(null);
          const editorRef = React.useRef(null);
          const sessionRef = React.useRef(props.sessionId);
          const draftRef = React.useRef(typeof draft === 'string' ? draft : '');
          const phaseRef = React.useRef(phase);
          const modeRef = React.useRef(null);
          const handlerRef = React.useRef(null);
          const pointerRef = React.useRef(null);
          const matchesRef = React.useRef(EMPTY);
          const panelHeightPxRef = React.useRef(null);

          sessionRef.current = props.sessionId;
          draftRef.current = typeof draft === 'string' ? draft : '';
          phaseRef.current = phase;

          const allowPreview = readNow('showPreview') !== false;

          const [browse, setBrowse] = React.useState(null);
          const [items, setItems] = React.useState(EMPTY);
          const [panel, setPanel] = React.useState(null);
          const [previewOpen, setPreviewOpen] = React.useState(false);
          const [previewText, setPreviewText] = React.useState(null);
          const [previewAnchor, setPreviewAnchor] = React.useState(null);
          const [loadingOlder, setLoadingOlder] = React.useState(false);
          /** The panel's own height as a number, so a reply swap can glide; null is `auto`. */
          const [panelHeightPx, setPanelHeightPx] = React.useState(null);
          const panelOpen = panel !== null;
          // The overlay may mount before the Host and settings have answered.
          // Until both have, it renders an empty, inactive tree without
          // attaching its composer listener, so nothing can race a half-built
          // component. Reading one query but writing through the other would
          // lose the first message of a brand-new session.
          const dataReady = typeof props.sessionId === 'string' && props.sessionId !== ''
            && refreshableSessions() !== undefined;

          const writeDraft = (text) => {
            try {
              inputActions.setDraft(text);
            } catch (error) {
              console.error('prompt-peek: the composer refused the draft write', error);
            }
          };

          const focusEditor = () => {
            const editor = editorRef.current;
            if (editor === null || editor === undefined) return;
            try {
              editor.focus();
            } catch (error) {
              console.error('prompt-peek: the composer could not regain focus', error);
            }
          };

          /**
           * Leave the history walk. The draft the composer held when the walk
           * began always comes back, whichever way the walk ends — `Esc`, a
           * click back into the composer, typing, or `↓` past the newest entry.
           * Every exit goes through `browseStep(..., 0)`, so this is the only
           * place that writes the stash back.
           */
          const exitBrowse = () => {
            const mode = modeRef.current;
            if (mode === null) return;
            modeRef.current = null;
            setBrowse(null);
            writeDraft(browseStep(mode, 0).draft);
          };

          const beginBrowse = (history) => {
            if (history.length === 0) return;
            const mode = { items: history, index: -1, stash: draftRef.current };
            const next = browseStep(mode, -1);
            if (next.mode === null) return;
            modeRef.current = next.mode;
            writeDraft(next.draft);
            setBrowse({ index: next.mode.index, total: next.mode.items.length });
          };

          /**
           * One `↑` (delta -1, older) or `↓` (delta 1, newer). Both directions
           * wrap like a shell history; stepping newer past the newest entry
           * returns to the draft the walk started from.
           */
          const stepBrowse = (delta) => {
            const mode = modeRef.current;
            if (mode === null) return;
            const next = browseStep(mode, delta);
            if (next.mode === null) {
              modeRef.current = null;
              setBrowse(null);
              writeDraft(next.draft);
              return;
            }
            modeRef.current = next.mode;
            writeDraft(next.draft);
            setBrowse({ index: next.mode.index, total: next.mode.items.length });
          };

          const focusQuery = () => {
            const field = inputRef.current;
            if (field === null || field === undefined) return;
            try {
              field.focus();
            } catch (error) {
              console.error('prompt-peek: the search field could not take focus', error);
            }
          };

          const closeSearch = (refocus) => {
            setPanel(null);
            setItems(EMPTY);
            setPreviewOpen(false);
            if (refocus) focusEditor();
          };

          const accept = (item) => {
            if (item !== undefined && item !== null && phaseRef.current === 'plain') writeDraft(item.text);
            closeSearch(true);
          };

          /** The session's prompts, capped by the history-limit setting. */
          const historyNow = () => limitHistory(readHistory(refreshableSessions(), sessionRef.current), readNow('historyLimit'));

          /**
           * Ask the Host for older pages before reading history (R5). `Ctrl+R`
           * waits for the window to reach the limit, so the panel opens on the
           * full history; `↑` starts browsing at once and refreshes the list
           * when the pages land, so a key press is never held by a request.
           * Concurrent triggers share one load.
           */
          const growing = React.useRef(null);
          const browsePending = React.useRef(false);
          const growHistory = () => {
            const sessions = refreshableSessions();
            if (sessions === undefined || sessions === null || growing.current !== null) return;
            setLoadingOlder(true);
            growing.current = loadHistory(sessions, sessionRef.current, readNow('historyLimit'))
              .catch(() => false)
              .then((grew) => {
                growing.current = null;
                setLoadingOlder(false);
                if (!grew) return;
                setItems(historyNow());
                // An `↑` pressed before any prompt was buffered starts browsing
                // as soon as the pages that hold them arrive.
                if (modeRef.current === null && browsePending.current && panel === null) {
                  browsePending.current = false;
                  const history = historyNow();
                  if (history.length > 0) beginBrowse(history);
                }
              });
          };

          const openSearch = () => {
            modeRef.current = null;
            setBrowse(null);
            setPreviewOpen(false);
            setPreviewText(null);
            setItems(historyNow());
            setPanel({ query: '', selected: 0 });
            // The panel is already usable; the list fills in when older pages
            // arrive (`setItems` above runs again from `growHistory`).
            growHistory();
          };

          const queryText = panel === null ? '' : panel.query;
          const order = readNow('browseOrder') === 'oldest' ? 'oldest' : 'newest';
          // «同时搜索回答»: off by default, the query only filters prompts.
          const searchAnswers = readNow('searchAnswers') === true;
          const matches = React.useMemo(() => (panel === null
            ? EMPTY
            : filterHistory(items, queryText, { order, searchAnswers, limit: MAX_RESULTS })), [panel, queryText, items, order, searchAnswers]);
          matchesRef.current = matches;
          const selected = matches.length === 0 ? 0 : Math.min(panel.selected, matches.length - 1);
          const codeLabels = React.useMemo(() => ({
            copy: translate('copyCode'),
            copied: translate('copiedCode'),
            code: translate('codeLabel'),
            wrap: translate('wrapCode'),
            unwrap: translate('unwrapCode'),
          }), [bind]);
          const previewNodes = React.useMemo(() => {
            if (previewText === null || previewText === undefined) return null;
            // A long prompt shows its tail; the first search match widens that
            // window, and the renderer marks the block holding it so the
            // preview can scroll there — the selected row then shows why it
            // matched instead of only its head.
            const anchor = previewAnchor === null ? -1 : previewAnchor.offset;
            const shown = previewWindow(previewText, anchor);
            const focus = anchor < 0 ? null : { offset: Math.max(0, anchor - shown.start) };
            return renderMarkdown(shown.text, { labels: codeLabels, focus });
          }, [previewText, codeLabels, previewAnchor]);
          const previewShown = previewOpen && matches.length > 0;
          const previewVisible = previewShown && allowPreview;
          const pager = pagePager({
            previewPageSize: readNow('previewPageSize'),
            smoothScroll: readNow('smoothScroll'),
          });

          handlerRef.current = (event) => {
            const editor = editorRef.current;
            if (editor === null || editor === undefined || !editor.contains(event.target)) return;
            if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
            if (panel !== null) return;
            const key = typeof event.key === 'string' ? event.key : '';
            const modifier = event.metaKey || event.ctrlKey;
            if (ownsComposerKey(event) === 'open-search') {
              event.preventDefault();
              event.stopPropagation();
              openSearch();
              return;
            }
            if (event.altKey) {
              exitBrowse();
              return;
            }
            if (modeRef.current !== null) {
              if (key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                exitBrowse();
                return;
              }
              if (key === 'ArrowUp' || key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                stepBrowse(key === 'ArrowUp' ? -1 : 1);
                return;
              }
              if (pageDirection(key) !== 0) {
                // Paging the reply preview while browsing: the preview is not
                // open yet, so the press opens it for the browsed prompt instead
                // of scrolling the chat behind the composer. The walk ends
                // first so the stashed draft survives, as on any other exit.
                event.preventDefault();
                event.stopPropagation();
                exitBrowse();
                openSearch();
                return;
              }
              if (!modifier && key !== 'Shift' && key !== 'Control' && key !== 'Meta' && key !== 'Alt') exitBrowse();
              return;
            }
            if (pageDirection(key) !== 0 && !modifier) {
              // The panel owns PgUp / PgDn, so the transcript behind the
              // composer never scrolls on a key the user typed into the field.
              event.preventDefault();
              event.stopPropagation();
              // With the panel hidden the key pages the selected prompt's reply:
              // turn the preview on (it doubles as "page") and open the panel.
              if (allowPreview) {
                setPreviewOpen(true);
                openSearch();
              }
              return;
            }
            // `↑` walks the history even when the composer already holds a
            // draft: the draft is stashed and comes back on exit. A non-plain
            // composer (an open slash menu, an approval card) keeps its own ↑.
            if (!modifier && !event.shiftKey && key === 'ArrowUp' && phaseRef.current === 'plain') {
              const history = historyNow();
              growHistory();
              browsePending.current = history.length === 0;
              if (history.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                beginBrowse(history);
              }
            }
          };

          pointerRef.current = (event) => {
            const editor = editorRef.current;
            if (editor === null || editor === undefined || !editor.contains(event.target)) return;
            if (panel !== null) {
              closeSearch(false);
              return;
            }
            exitBrowse();
          };

          React.useEffect(() => {
            modeRef.current = null;
            setBrowse(null);
            setPanel(null);
            setItems(EMPTY);
            setPreviewOpen(false);
            setPreviewText(null);
            if (!dataReady) return undefined;
            let disposed = false;
            let frame = 0;
            let teardown = null;
            let attempts = 0;
            const attach = () => {
              if (disposed) return;
              const found = rootRef.current === null ? null : findComposer(rootRef.current);
              if (found === null) {
                attempts += 1;
                if (attempts < 120) frame = requestAnimationFrame(attach);
                return;
              }
              const onKeyDown = (event) => {
                const handler = handlerRef.current;
                if (handler !== null) handler(event);
              };
              const onPointerDown = (event) => {
                const pointer = pointerRef.current;
                if (pointer !== null) pointer(event);
              };
              found.card.addEventListener('keydown', onKeyDown, true);
              found.card.addEventListener('pointerdown', onPointerDown, true);
              editorRef.current = found.editor;
              teardown = () => {
                found.card.removeEventListener('keydown', onKeyDown, true);
                found.card.removeEventListener('pointerdown', onPointerDown, true);
              };
            };
            attach();
            return () => {
              disposed = true;
              if (frame !== 0) cancelAnimationFrame(frame);
              if (teardown !== null) teardown();
            };
          }, [props.sessionId, dataReady]);

          React.useEffect(() => {
            if (!panelOpen) return;
            const field = inputRef.current;
            if (field === null || field === undefined) return;
            field.focus();
            field.select();
          }, [panelOpen]);

          React.useEffect(() => {
            if (!panelOpen) return;
            const onPointerDown = (event) => {
              const list = panelRef.current;
              const editor = editorRef.current;
              const target = event.target;
              if (list !== null && list !== undefined && list.contains(target)) return;
              if (editor !== null && editor !== undefined && editor.contains(target)) return;
              closeSearch(false);
            };
            document.addEventListener('pointerdown', onPointerDown, true);
            return () => document.removeEventListener('pointerdown', onPointerDown, true);
          }, [panelOpen]);

          React.useEffect(() => {
            const list = listRef.current;
            if (!panelOpen || list === null || list === undefined) return;
            const active = list.querySelector('[data-active="true"]');
            if (active === null || active === undefined) return;
            if (active.offsetTop < list.scrollTop) list.scrollTop = active.offsetTop;
            else if (active.offsetTop + active.offsetHeight > list.scrollTop + list.clientHeight) {
              list.scrollTop = active.offsetTop + active.offsetHeight - list.clientHeight;
            }
          }, [selected, panelOpen, previewVisible]);

          /**
           * Drive the panel as a pixel height so a reply swap glides instead of
           * snapping (see {@link panelHeight}). Measured after layout, before
           * paint: the panel's content fires this effect whenever the list, the
           * query, or the preview changes, and the old number is the transition's
           * starting point. `auto` is handed back when the panel closes.
           */
          React.useLayoutEffect(() => {
            const panel = panelRef.current;
            if (panel === null || panel === undefined || !panelOpen) {
              panelHeightPxRef.current = null;
              setPanelHeightPx(null);
              return;
            }
            // Measure on a clone, never on the panel: clearing the panel's
            // height and writing it back in the same task makes the browser
            // treat the value as unchanged and cancels the glide (checked in
            // Chrome 151). The clone is laid out at the panel's width with
            // `height:auto`, well off-screen, and removed right away.
            const content = naturalHeight(panel);
            const next = panelHeight({
              open: true,
              content,
              viewport: window.innerHeight,
              reduced: typeof window.matchMedia === 'function'
                && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            }).height;
            if (next !== panelHeightPxRef.current) {
              panelHeightPxRef.current = next;
              setPanelHeightPx(next);
            }
          }, [panelOpen, matches, previewNodes, previewVisible, queryText, bind]);

          /** Scroll the row that carries a long prompt's first match into view of the preview. */
          React.useEffect(() => {
            const scroller = previewRef.current;
            if (!previewVisible || scroller === null || scroller === undefined) return;
            const hit = scroller.querySelector('.dsh-pp-md__focus');
            if (hit === null || hit === undefined) return;
            // `offsetTop` is measured against the offset parent, the scroller,
            // so page scrolling cannot skew it.
            const offset = hit.offsetTop - 12;
            if (offset <= 0 || Math.abs(offset - scroller.scrollTop) < 1) return;
            scrollPreviewBy(offset - scroller.scrollTop, false, false);
          }, [previewNodes, previewVisible]);

          React.useEffect(() => {
            if (!previewOpen) return;
            const item = matches[selected];
            if (item === undefined || item === null) {
              setPreviewText(null);
              return;
            }
            // The row's own text doubles as the key, so a snapshot rebuilt
            // between listing and previewing still finds the prompt.
            const reply = readReply(refreshableSessions(), sessionRef.current, item.seq, item);
            const next = reply === null || reply.text === '' ? null : reply.text;
            const anchor = next === null ? null : matchAnchor(next, queryText.trim().toLowerCase());
            setPreviewAnchor(anchor);
            setPreviewText((previous) => (previous === next ? previous : next));
          }, [previewOpen, matches, selected]);

          /** Cancel a preview scroll animation that is still running. */
          const stopPreviewScroll = () => {
            const animation = scrollAnimRef.current;
            if (animation.frame !== 0) {
              cancelAnimationFrame(animation.frame);
              animation.frame = 0;
            }
            animation.repeat = false;
            animation.direction = 0;
          };

          /**
           * Glide the preview by `delta` pixels instead of jumping. Every press
           * starts from the reader's position, replaces any running target, and
           * turns the glide around when it points the other way; a key repeat
           * keeps one page of lead so it cannot race ahead. A wheel or a drag
           * cancels the glide so the reader never fights it. `snap` false places
           * the preview directly, for revealing a match on open.
           *
           * @returns {boolean} whether the press had room to move the preview
           */
          const scrollPreviewBy = (delta, repeat, snap) => {
            const scroller = previewRef.current;
            if (scroller === null || scroller === undefined) return false;
            const limit = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            if (limit <= 0) {
              // Nothing to scroll yet (a short reply, or a preview that was just
              // turned on): the caller falls back to moving the selection.
              return false;
            }
            const animation = scrollAnimRef.current;
            // Every press — discrete or a key repeat — starts from where the
            // preview is now and, when a glide is still running, replaces its
            // target. A press against the running direction turns the glide
            // around; a repeat only adds one page of lead (see `glideFrame`).
            const frame = glideFrame(scroller, animation.target, delta, repeat);
            const target = frame.target;
            animation.repeat = repeat === true;
            animation.direction = Math.sign(delta);
            if (frame.atEdge) {
              // Nothing left in this direction: stop instead of gliding toward
              // the edge the reader already reached.
              stopPreviewScroll();
              return false;
            }
            animation.target = target;
            animation.queued = target;
            if (snap === false) {
              scroller.scrollTop = target;
              return true;
            }
            const reduced = typeof window !== 'undefined'
              && typeof window.matchMedia === 'function'
              && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (reduced || !pager.smooth) {
              stopPreviewScroll();
              scroller.scrollTop = target;
              return true;
            }
            // Already gliding: the new target replaces the old one and the
            // running loop picks it up, in whichever direction it points.
            if (animation.frame !== 0) return true;
            let previous = performance.now();
            const step = (now) => {
              const el = previewRef.current;
              if (el === null || el === undefined) {
                animation.frame = 0;
                return;
              }
              const elapsed = Math.min(64, Math.max(0, now - previous));
              previous = now;
              // Reflow can shorten the reply mid-glide; retarget so the loop always terminates.
              animation.target = Math.min(animation.target, Math.max(0, el.scrollHeight - el.clientHeight));
              const remaining = animation.target - el.scrollTop;
              // A press that reverses a running glide lands here with a target
              // on the other side of the current position; the frame below moves
              // toward it in `remaining`'s own sign.
              animation.direction = Math.sign(remaining);
              // Whole pixels in the travel's own direction, so an upward glide
              // can never be turned into a downward one (`glideStep` explains).
              const applied = glideStep(remaining, elapsed, PREVIEW_SCROLL_TAU);
              if (applied === 0) {
                el.scrollTop = animation.target;
                animation.frame = 0;
                return;
              }
              const before = el.scrollTop;
              el.scrollTop = before + applied;
              // A short reply can stop accepting scrollTop mid-glide; ending
              // here beats spinning frames that move nothing.
              if (el.scrollTop === before) {
                animation.frame = 0;
                return;
              }
              if (Math.abs(remaining) - Math.abs(applied) < 1) {
                el.scrollTop = animation.target;
                animation.frame = 0;
                return;
              }
              animation.frame = requestAnimationFrame(step);
            };
            animation.frame = requestAnimationFrame(step);
            return true;
          };

          /** Whether the preview still has room to travel in `delta`'s direction. */
          const previewAtEdge = (delta) => {
            const scroller = previewRef.current;
            if (scroller === null || scroller === undefined) return true;
            const limit = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            return delta > 0 ? scroller.scrollTop >= limit - 0.5 : scroller.scrollTop <= 0.5;
          };

          /**
           * One `PgUp` / `PgDn` press while the search panel is open. Returns
           * whether the press was handled, so the caller only prevents the
           * default when the panel actually did something with it.
           */
          const pageKey = (key, repeat) => {
            const delta = pageDirection(key);
            if (delta === 0) return false;
            const plan = pagePlan(delta, previewVisible, allowPreview, previewAtEdge(delta));
            if (plan.action === 'none') return false;
            if (plan.action === 'open') {
              // No preview yet: turn it on and page it once the scroller exists.
              // The key must still not reach the chat viewport, or it scrolls
              // the transcript behind the panel.
              pendingPageRef.current = delta;
              setPreviewOpen(true);
              return true;
            }
            // Swallow the key either way: PgUp / PgDn belong to the panel,
            // never to the transcript behind it. At the edge the press stops
            // there instead of moving to the next prompt — paging one reply
            // never spills over into another.
            if (plan.action === 'edge') return true;
            scrollPreviewBy(delta * pager.page, repeat, true);
            return true;
          };

          // A `PgUp` / `PgDn` pressed while the preview was still hidden turns
          // the preview on and remembers the direction here; the next frame,
          // once the scroller exists, moves it one page. It is consumed once.
          const pendingPageRef = React.useRef(0);
          React.useEffect(() => {
            const pending = pendingPageRef.current;
            if (pending === 0 || !previewVisible) return;
            pendingPageRef.current = 0;
            scrollPreviewBy(pending * pager.page, false, true);
          }, [previewVisible, previewText]);

          /**
           * Releasing `PgUp` / `PgDn` after a held key ends its glide, so the
           * preview never keeps travelling to a page target the reader stopped
           * asking for. A discrete press is already on its way to exactly one
           * page and lands there.
           */
          const onQueryKeyUp = (event) => {
            const key = typeof event.key === 'string' ? event.key : '';
            if (key !== 'PageDown' && key !== 'PageUp') return;
            const animation = scrollAnimRef.current;
            const held = animation.repeat === true;
            animation.repeat = false;
            if (held) stopPreviewScroll();
          };

          React.useEffect(() => stopPreviewScroll, [selected, previewOpen, previewText]);

          React.useEffect(() => {
            if (!previewVisible) return;
            const scroller = previewRef.current;
            if (scroller === null || scroller === undefined) return;
            scroller.addEventListener('wheel', stopPreviewScroll, { passive: true });
            scroller.addEventListener('touchstart', stopPreviewScroll, { passive: true });
            scroller.addEventListener('pointerdown', stopPreviewScroll);
            return () => {
              scroller.removeEventListener('wheel', stopPreviewScroll);
              scroller.removeEventListener('touchstart', stopPreviewScroll);
              scroller.removeEventListener('pointerdown', stopPreviewScroll);
            };
          }, [previewVisible]);

          /**
           * The wheel moves the preview a quarter page per notch while the
           * cursor is over the search box. A wheel gesture has no key-up, so it
           * keeps animating until the accumulated delta turns around or
           * settles.
           */
          const onQueryWheel = (event) => {
            if (!previewVisible) return;
            const scroller = previewRef.current;
            if (scroller === null || scroller === undefined) return;
            const limit = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            if (limit <= 0) return;
            // One notch is a quarter of the configured page: wheel deltas arrive
            // in arbitrary pixel amounts, so they are scaled onto that step.
            const notch = Math.max(24, Math.round(pager.page / 4));
            const units = event.deltaMode === 1 ? notch / 3 : (event.deltaMode === 2 ? notch : notch / 100);
            const delta = event.deltaY * units;
            if (delta === 0) return;
            event.preventDefault();
            event.stopPropagation();
            const animation = scrollAnimRef.current;
            const running = animation.frame !== 0;
            if (running && (Math.sign(delta) !== animation.direction || animation.target <= 0 || animation.target >= limit)) {
              stopPreviewScroll();
            }
            animation.direction = Math.sign(delta);
            if (animation.frame !== 0) {
              // Retarget the glide by the notch instead of restarting it, so a
              // continuous wheel gesture keeps one step per notch.
              animation.queued = Math.max(0, Math.min(limit, animation.queued + delta));
              animation.target = animation.queued;
              return;
            }
            scrollPreviewBy(delta > 0 ? notch : -notch, true);
          };

          const onQueryKeyDown = (event) => {
            const native = event.nativeEvent;
            if (native !== undefined && native !== null && (native.isComposing === true || native.keyCode === 229)) return;
            const key = typeof event.key === 'string' ? event.key : '';
            if ((event.metaKey || event.ctrlKey) && (key === 'r' || key === 'R')) {
              event.preventDefault();
              event.stopPropagation();
              closeSearch(true);
              return;
            }
            if ((key === ' ' || key === 'Spacebar') && !event.metaKey && !event.ctrlKey && !event.altKey) {
              if (event.shiftKey) return;
              if (matchesRef.current.length === 0) return;
              event.preventDefault();
              event.stopPropagation();
              setPreviewOpen((open) => !open);
              return;
            }
            if (pageDirection(key) !== 0) {
              // Handled by `pageKey` whether the preview is visible or not, so
              // the key never falls through to the chat viewport's scrolling.
              if (!pageKey(key, event.repeat === true)) return;
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (key === 'ArrowDown' || key === 'ArrowUp') {
              event.preventDefault();
              event.stopPropagation();
              const count = matchesRef.current.length;
              if (count === 0) return;
              const delta = key === 'ArrowDown' ? 1 : -1;
              setPanel((previous) => {
                if (previous === null) return previous;
                const next = Math.max(0, Math.min(count - 1, previous.selected + delta));
                return next === previous.selected ? previous : { query: previous.query, selected: next };
              });
              return;
            }
            if (key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              accept(matchesRef.current[selected]);
              return;
            }
            if (key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeSearch(true);
              return;
            }
            if (key === 'Tab') {
              event.preventDefault();
              event.stopPropagation();
              closeSearch(true);
            }
          };

          const row = (item, index) => h('button', {
            key: item.key,
            id: 'dsh-pp-option-' + index,
            type: 'button',
            role: 'option',
            'aria-selected': index === selected,
            'data-active': index === selected ? 'true' : undefined,
            className: 'dsh-pp-row',
            title: previewOf(item.text),
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => accept(item),
          },
          highlight(item.text, queryText.trim().toLowerCase()),
          item.answerHit === true
            ? h('span', { key: 'answer-hit', className: 'dsh-pp-row__hit' }, translate('answerHit'))
            : null);

          if (!dataReady) return h('div', { ref: rootRef, style: { display: 'none' }, 'data-dsh-prompt-peek': '' });
          return h('div', { ref: rootRef, style: ROOT_STYLE, 'data-dsh-prompt-peek': '' },
            h('style', { key: 'style' }, CSS),
            browse === null ? null : h('div', { key: 'pill', className: 'dsh-pp-pill' },
              h('span', { className: 'dsh-pp-pill__dot' }),
              h('span', null, translate('browse')),
              h('span', { className: 'dsh-pp-pill__count' }, (browse.index + 1) + '/' + browse.total),
              h('span', { className: 'dsh-pp-pill__hint' }, loadingOlder ? translate('loadingOlder') : translate('browseHint')),
            ),
            panelOpen ? h('div', {
              key: 'panel',
              ref: panelRef,
              className: 'dsh-pp-panel',
              style: panelHeightPx === null ? undefined : { height: panelHeightPx + 'px' },
              role: 'dialog',
              'aria-label': translate('title'),
              onMouseDown: (event) => {
                // The footer button and the preview are not focus stops; keep the
                // query field focused so ↑ / ↓ / Space keep working after a click.
                if (event.target !== null && event.target !== undefined && event.target.closest !== undefined
                  && event.target.closest('a, button, input, [data-disallow-space]') !== null) return;
                event.preventDefault();
                focusQuery();
              },
            },
              h('div', { className: 'dsh-pp-head' },
                h('span', { className: 'dsh-pp-title' }, translate('title')),
                h('span', { className: 'dsh-pp-count' }, loadingOlder && items.length === 0
                ? translate('loadingOlder')
                : (matches.length === 0 ? translate('emptyShort') : ((selected + 1) + ' / ' + matches.length))),
              ),
              h('div', { className: 'dsh-pp-search' },
                h('svg', { className: 'dsh-pp-search__icon', viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
                  h('circle', { cx: 7, cy: 7, r: 4.6, stroke: 'currentColor', strokeWidth: 1.4 }),
                  h('path', { d: 'M10.5 10.5L14 14', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
                ),
                h('input', {
                  ref: inputRef,
                  className: 'dsh-pp-query',
                  type: 'text',
                  value: panel.query,
                  placeholder: translate('placeholder'),
                  'aria-label': translate('placeholder'),
                  'aria-controls': 'dsh-pp-listbox',
                  autoComplete: 'off',
                  spellCheck: false,
                  onChange: (event) => setPanel({ query: event.target.value, selected: 0 }),
                  onKeyDown: onQueryKeyDown,
                  onKeyUp: onQueryKeyUp,
                  onWheel: onQueryWheel,
                }),
              ),
              h('div', {
                ref: listRef,
                id: 'dsh-pp-listbox',
                className: 'dsh-pp-list',
                role: 'listbox',
                tabIndex: -1,
                onWheel: onQueryWheel,
              },
                matches.length === 0
                  ? h('div', { className: 'dsh-pp-empty' }, translate('empty'))
                  : matches.map(row),
              ),
              previewVisible ? h('div', { key: 'preview', className: 'dsh-pp-preview' },
                h('div', { className: 'dsh-pp-preview__title' }, translate('previewTitle')),
                // The scroller is this body, not the box around it: the title
                // stays put as a fixed divider while PgUp / PgDn move the reply.
                h('div', { ref: previewRef, className: previewNodes === null ? 'dsh-pp-preview__empty' : 'dsh-pp-preview__body' },
                  previewNodes === null ? translate('previewMissing') : previewNodes),
              ) : null,
              h('div', { className: 'dsh-pp-hint' },
                h('span', { className: 'dsh-pp-hint__group' }, keycap('↑'), keycap('↓'), translate('hintSelect')),
                allowPreview
                  ? h('span', { className: 'dsh-pp-hint__group' }, keycap(translate('keySpace')), translate(previewShown ? 'hintHidePreview' : 'hintPreview'))
                  : null,
                allowPreview ? h('span', { className: 'dsh-pp-hint__group' }, keycap('Shift'), keycap(translate('keySpace')), translate('hintTypeSpace')) : null,
                allowPreview ? h('span', { className: 'dsh-pp-hint__group' }, keycap('PgUp'), keycap('PgDn'), translate('hintPage')) : null,
                previewVisible ? h('span', { className: 'dsh-pp-hint__group' }, translate('hintWheel')) : null,
                h('span', { className: 'dsh-pp-hint__group' }, keycap('Enter'), translate('hintInsert')),
                h('span', { className: 'dsh-pp-hint__group' }, keycap('Esc'), translate('hintClose')),
                allowPreview ? null : h('button', {
                  type: 'button',
                  className: 'dsh-pp-hint__group dsh-pp-hint__where',
                  title: translateKey(bind, 'settingsLocation'),
                  onMouseDown: (event) => event.preventDefault(),
                  onClick: () => enablePreview(),
                  'data-disallow-space': 'true',
                }, translate('previewOff'), ' · ', translate('turnOn')),
              ),
            ) : null,
          );
        }

        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay',
          id: 'prompt-peek',
          order: 4,
        }, ComposerHistory));

        // Settings gets a top-level section of its own (shown between Shell and
        // Built-in plugins), with its own sidebar row and icon, instead of a tab
        // buried inside the built-in plugins section. The section is built once
        // and mounted on first selection by the settings shell.
        const PromptPeekSettings = createSettingsPage(ctx, settingsStore, bind, useSettings, useLocaleRevision);
        const settingsLabel = (key) => () => ctx.locale.bind(NS)(key);
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: SETTING_TAB_ID,
          order: 40,
          label: settingsLabel('settingsNav'),
        }, PromptPeekSettings));
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
          name: 'settings.section.icon',
          id: SETTING_TAB_ID,
          order: 40,
          label: settingsLabel('settingsNav'),
        }, (props) => {
          const size = props !== null && props !== undefined && typeof props.size === 'number' ? props.size : 16;
          return React.createElement(GlobeIcon, { size });
        }));
      },
    };
  },
});
