window.__ModuleLoader__.load({
  id: 'dsh-prompt-peek',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dsh-prompt-peek';
    const MAX_HISTORY = 300;
    const MAX_RESULTS = 50;
    const MAX_REPLY = 6000;
    const REPLY_TAIL = 400;
    const PREVIEW_PAGE = 180;
    const PREVIEW_SCROLL_TAU = 100;
    const EMPTY = [];

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
.dsh-pp-panel{pointer-events:auto;display:flex;flex-direction:column;gap:7px;padding:10px;border:0.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;max-height:min(70vh,620px);overflow:hidden}
.dsh-pp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 2px}
.dsh-pp-title{color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;font-weight:500}
.dsh-pp-count{flex:none;border-radius:999px;padding:1px 8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:16px;font-variant-numeric:tabular-nums}
.dsh-pp-search{position:relative;display:flex;align-items:center}
.dsh-pp-search__icon{position:absolute;left:9px;width:13px;height:13px;color:var(--dsw-alias-label-secondary);pointer-events:none}
.dsh-pp-query{box-sizing:border-box;width:100%;height:34px;padding:0 10px 0 30px;border-radius:8px;border:0.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}
.dsh-pp-query::placeholder{color:var(--dsw-alias-label-secondary)}
.dsh-pp-query:focus{border-color:var(--dsw-alias-brand-primary)}
.dsh-pp-list{position:relative;flex:1 1 auto;display:flex;flex-direction:column;gap:1px;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:1px 0}
.dsh-pp-row{display:block;box-sizing:border-box;width:100%;text-align:left;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;padding:5px 9px;border-radius:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.dsh-pp-row:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-pp-row[data-active="true"]{background:var(--dsw-alias-bg-layer-2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,var(--dsw-alias-bg-layer-2))}
.dsh-pp-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-pp-mark{background:var(--dsw-alias-bg-layer-2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent);color:inherit;border-radius:3px;padding:0 1px}
.dsh-pp-empty{padding:12px 8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dsh-pp-preview{flex:0 1 auto;min-height:0;max-height:min(46vh,320px);overflow-y:auto;overscroll-behavior:contain;border-top:0.5px solid var(--dsw-alias-border-l1);margin-top:1px;padding:8px 4px 2px 2px}
.dsh-pp-preview__title{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:16px;letter-spacing:.02em;margin-bottom:5px}
.dsh-pp-preview__title::before{content:"";width:5px;height:5px;border-radius:999px;background:var(--dsw-alias-brand-primary);opacity:.8}
.dsh-pp-preview__body{font-size:12px;line-height:18px}
.dsh-pp-preview__empty{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dsh-pp-hint{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:7px 2px 0;border-top:0.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dsh-pp-hint__group{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}
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

    /** Human messages actually sent in this session, oldest first, consecutive duplicates folded. */
    function readHistory(sessions, sessionId) {
      if (sessions === undefined || sessions === null || sessionId === undefined || sessionId === null) return EMPTY;
      let binding;
      try {
        binding = sessions.binding(sessionId);
      } catch (error) {
        return EMPTY;
      }
      if (binding === undefined || binding === null) return EMPTY;
      const source = binding.eventSource;
      if (source === undefined || source === null || typeof source.getSnapshot !== 'function') return EMPTY;
      let snapshot;
      try {
        snapshot = source.getSnapshot();
      } catch (error) {
        return EMPTY;
      }
      if (snapshot === undefined || snapshot === null || !Array.isArray(snapshot.entries)) return EMPTY;
      const history = [];
      let previousText = null;
      for (const entry of snapshot.entries) {
        if (entry === null || entry === undefined || entry.type !== 'event') continue;
        const event = entry.event;
        if (event === null || event === undefined || event.type !== 'user/message') continue;
        if (event.surfaceOp !== 'append') continue;
        const data = event.data;
        if (data === null || data === undefined) continue;
        if (data.source === null || data.source === undefined || data.source.kind !== 'user') continue;
        if (!Array.isArray(data.content)) continue;
        let text = '';
        for (const block of data.content) {
          if (block !== null && block !== undefined && block.type === 'text' && typeof block.text === 'string') text += block.text;
        }
        if (text.trim() === '') continue;
        if (text === previousText) continue;
        previousText = text;
        history.push({ key: 'h-' + String(event.seq), seq: event.seq, text, lower: text.toLowerCase() });
      }
      return history.length > MAX_HISTORY ? history.slice(history.length - MAX_HISTORY) : history;
    }

    /** Typed text of one assistant message, reasoning and tool blocks excluded. */
    function assistantText(content) {
      if (!Array.isArray(content)) return '';
      const parts = [];
      for (const block of content) {
        if (block !== null && block !== undefined && block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
          parts.push(block.text.trim());
        }
      }
      return parts.join('\n\n');
    }

    /** The assistant answer recorded after one sent message, up to the next human message. */
    function readReply(sessions, sessionId, seq) {
      if (sessions === undefined || sessions === null || sessionId === undefined || sessionId === null) return null;
      let binding;
      try {
        binding = sessions.binding(sessionId);
      } catch (error) {
        return null;
      }
      if (binding === undefined || binding === null) return null;
      const source = binding.eventSource;
      if (source === undefined || source === null || typeof source.getSnapshot !== 'function') return null;
      let snapshot;
      try {
        snapshot = source.getSnapshot();
      } catch (error) {
        return null;
      }
      if (snapshot === undefined || snapshot === null || !Array.isArray(snapshot.entries)) return null;
      let found = false;
      const texts = [];
      for (const entry of snapshot.entries) {
        if (entry === null || entry === undefined || entry.type !== 'event') continue;
        const event = entry.event;
        if (event === null || event === undefined) continue;
        if (!found) {
          if (event.type === 'user/message' && event.seq === seq) found = true;
          continue;
        }
        if (event.type === 'user/message' && event.surfaceOp === 'append' && event.data !== null && event.data !== undefined
          && event.data.source !== null && event.data.source !== undefined && event.data.source.kind === 'user') break;
        if (event.type !== 'assistant/message' || event.surfaceOp !== 'append') continue;
        const message = event.data === null || event.data === undefined ? null : event.data.message;
        const text = assistantText(message === null || message === undefined ? null : message.content);
        if (text !== '') texts.push(text);
        if (texts.length >= 200) break;
      }
      if (!found) return null;
      // The closing reply carries the answer; short tails pull in the message before them.
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

    /** Compact Markdown renderer for recorded replies: no HTML, links restricted to http(s), mailto, and anchors. */
    function renderMarkdown(source) {
      const lines = String(source).replace(/\r\n?/gu, '\n').split('\n');
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
        if (block.type === 'code') {
          return h('pre', { key, className: 'dsh-pp-md__pre' },
            block.lang === '' ? null : h('span', { className: 'dsh-pp-md__lang' }, block.lang),
            h('code', null, block.text));
        }
        if (block.type === 'heading') {
          const level = Math.min(block.level, 3);
          return h('div', { key, className: 'dsh-pp-md__h dsh-pp-md__h' + level }, renderInline(block.text, key));
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
        return h('p', { key, className: 'dsh-pp-md__p' }, renderInline(block.text, key));
      });
      return h('div', { className: 'dsh-pp-md' }, children);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const locale = ctx.get('locale');
        const translate = (key) => {
          const current = ctx.get('locale');
          if (current === undefined || current === null) return key;
          return current.bind(NS)(key);
        };
        const refreshableSessions = () => ctx.get('sessions');

        if (locale !== undefined && locale !== null) {
          ctx.effect(() => locale.register(NS, 'zh', {
            title: '搜索已发送的消息',
            placeholder: '输入关键词…',
            empty: '没有匹配的消息',
            emptyShort: '无结果',
            hintSelect: '选择',
            hintPreview: '预览',
            hintHidePreview: '收起',
            hintTypeSpace: '输入空格',
            hintPage: '翻页',
            hintInsert: '填入',
            hintClose: '取消',
            keySpace: '空格',
            previewTitle: 'dsh 的回答',
            previewMissing: '这一条在已加载的记录里没有文字回复。',
            browse: '历史',
            browseHint: '↑↓ 翻看 · Esc 退出',
          }), 'prompt-peek: zh dictionary');
          ctx.effect(() => locale.register(NS, 'en', {
            title: 'Search sent messages',
            placeholder: 'Type to filter…',
            empty: 'No matching messages',
            emptyShort: 'No results',
            hintSelect: 'select',
            hintPreview: 'preview',
            hintHidePreview: 'hide',
            hintTypeSpace: 'type space',
            hintPage: 'page',
            hintInsert: 'insert',
            hintClose: 'cancel',
            keySpace: 'Space',
            previewTitle: "dsh's reply",
            previewMissing: 'No text reply is available in the loaded history.',
            browse: 'History',
            browseHint: '↑↓ browse · Esc exit',
          }), 'prompt-peek: en dictionary');
        }

        function ComposerHistory(props) {
          const inputActions = props.inputActions;
          const useInput = typeof props.useInput === 'function'
            ? props.useInput
            : (select) => select({ draft: '', phase: 'plain' });
          const draft = useInput((state) => (state === undefined || state === null ? "" : state.draft));
          const phase = useInput((state) => (state === undefined || state === null ? "plain" : state.phase));

          React.useSyncExternalStore(
            React.useCallback((notify) => {
              const current = ctx.get('locale');
              return current === undefined || current === null ? () => {} : current.subscribe(notify);
            }, []),
            () => {
              const current = ctx.get('locale');
              return current === undefined || current === null ? 0 : current.getSnapshot().revision;
            },
            () => 0,
          );

          const rootRef = React.useRef(null);
          const panelRef = React.useRef(null);
          const previewRef = React.useRef(null);
          const scrollAnimRef = React.useRef({ frame: 0, target: 0 });
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

          sessionRef.current = props.sessionId;
          draftRef.current = typeof draft === 'string' ? draft : '';
          phaseRef.current = phase;

          const [browse, setBrowse] = React.useState(null);
          const [items, setItems] = React.useState(EMPTY);
          const [panel, setPanel] = React.useState(null);
          const [previewOpen, setPreviewOpen] = React.useState(false);
          const [previewText, setPreviewText] = React.useState(null);
          const panelOpen = panel !== null;

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

          const exitBrowse = (restore) => {
            const mode = modeRef.current;
            if (mode === null) return;
            modeRef.current = null;
            setBrowse(null);
            if (restore) writeDraft(mode.stash);
          };

          const beginBrowse = (history) => {
            if (history.length === 0) return;
            const index = history.length - 1;
            modeRef.current = { items: history, index, stash: draftRef.current };
            writeDraft(history[index].text);
            setBrowse({ index, total: history.length });
          };

          const stepBrowse = (delta) => {
            const mode = modeRef.current;
            if (mode === null) return;
            const next = mode.index + delta;
            if (next < 0) return;
            if (next >= mode.items.length) {
              exitBrowse(true);
              return;
            }
            mode.index = next;
            writeDraft(mode.items[next].text);
            setBrowse({ index: next, total: mode.items.length });
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

          const openSearch = () => {
            modeRef.current = null;
            setBrowse(null);
            setPreviewOpen(false);
            setPreviewText(null);
            setItems(readHistory(refreshableSessions(), sessionRef.current));
            setPanel({ query: '', selected: 0 });
          };

          const queryText = panel === null ? '' : panel.query;
          const matches = React.useMemo(() => {
            if (panel === null) return EMPTY;
            const query = queryText.trim().toLowerCase();
            const found = [];
            for (let index = items.length - 1; index >= 0 && found.length < MAX_RESULTS; index -= 1) {
              const item = items[index];
              if (query === '' || item.lower.indexOf(query) >= 0) found.push(item);
            }
            return found;
          }, [panel, queryText, items]);
          matchesRef.current = matches;
          const selected = matches.length === 0 ? 0 : Math.min(panel.selected, matches.length - 1);
          const previewNodes = React.useMemo(
            () => (previewText === null || previewText === undefined ? null : renderMarkdown(previewText)),
            [previewText],
          );
          const previewVisible = previewOpen && matches.length > 0;

          handlerRef.current = (event) => {
            const editor = editorRef.current;
            if (editor === null || editor === undefined || !editor.contains(event.target)) return;
            if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
            if (panel !== null) return;
            const key = typeof event.key === 'string' ? event.key : '';
            const modifier = event.metaKey || event.ctrlKey;
            if (modifier && !event.altKey && !event.shiftKey && (key === 'r' || key === 'R')) {
              event.preventDefault();
              event.stopPropagation();
              openSearch();
              return;
            }
            if (event.altKey) {
              exitBrowse(false);
              return;
            }
            if (modeRef.current !== null) {
              if (key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                exitBrowse(false);
                return;
              }
              if (key === 'ArrowUp' || key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                stepBrowse(key === 'ArrowUp' ? -1 : 1);
                return;
              }
              if (!modifier && key !== 'Shift' && key !== 'Control' && key !== 'Meta' && key !== 'Alt') exitBrowse(false);
              return;
            }
            if (!modifier && !event.shiftKey && key === 'ArrowUp' && phaseRef.current === 'plain' && draftRef.current.trim() === '') {
              const history = readHistory(refreshableSessions(), sessionRef.current);
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
            exitBrowse(false);
          };

          React.useEffect(() => {
            modeRef.current = null;
            setBrowse(null);
            setPanel(null);
            setItems(EMPTY);
            setPreviewOpen(false);
            setPreviewText(null);
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
          }, [props.sessionId]);

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

          React.useEffect(() => {
            if (!previewOpen) return;
            const item = matches[selected];
            if (item === undefined || item === null) {
              setPreviewText(null);
              return;
            }
            const reply = readReply(refreshableSessions(), sessionRef.current, item.seq);
            const next = reply === null || reply.text === '' ? null : reply.text;
            setPreviewText((previous) => (previous === next ? previous : next));
          }, [previewOpen, matches, selected]);

          /** Cancel a preview scroll animation that is still running. */
          const stopPreviewScroll = () => {
            const animation = scrollAnimRef.current;
            if (animation.frame !== 0) {
              cancelAnimationFrame(animation.frame);
              animation.frame = 0;
            }
          };

          /**
           * Glide the preview by `delta` pixels instead of jumping. Discrete presses queue onto
           * the running target, while a held key only keeps one page of lead so it cannot race
           * ahead; a wheel or a drag cancels the glide so the reader never fights it.
           */
          const scrollPreviewBy = (delta, repeat) => {
            const scroller = previewRef.current;
            if (scroller === null || scroller === undefined) return;
            const limit = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            if (limit <= 0) return;
            const animation = scrollAnimRef.current;
            animation.held = repeat === true;
            const running = animation.frame !== 0;
            // A held key repeats far faster than the glide can move, so a repeat only ever
            // keeps one page of lead; discrete presses may queue up.
            const from = running && !repeat ? animation.target : scroller.scrollTop;
            const target = Math.max(0, Math.min(limit, from + delta));
            animation.target = target;
            if (Math.abs(target - scroller.scrollTop) < 1) {
              scroller.scrollTop = target;
              return;
            }
            const reduced = typeof window !== 'undefined'
              && typeof window.matchMedia === 'function'
              && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (reduced) {
              stopPreviewScroll();
              scroller.scrollTop = target;
              return;
            }
            if (animation.frame !== 0) return;
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
              if (Math.abs(remaining) < 1) {
                el.scrollTop = animation.target;
                animation.frame = 0;
                return;
              }
              const advance = Math.max(1, remaining * (1 - Math.exp(-elapsed / PREVIEW_SCROLL_TAU)));
              // Browsers round scrollTop, so a sub-pixel final step could otherwise stall.
              el.scrollTop += remaining > 0 ? advance : -advance;
              animation.frame = requestAnimationFrame(step);
            };
            animation.frame = requestAnimationFrame(step);
          };

          const onQueryKeyUp = (event) => {
            const key = typeof event.key === 'string' ? event.key : '';
            if (key !== 'PageDown' && key !== 'PageUp') return;
            const animation = scrollAnimRef.current;
            if (animation.held !== true) return;
            animation.held = false;
            stopPreviewScroll();
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
            if (previewVisible && (key === 'PageDown' || key === 'PageUp')) {
              event.preventDefault();
              event.stopPropagation();
              scrollPreviewBy(key === 'PageDown' ? PREVIEW_PAGE : -PREVIEW_PAGE, event.repeat === true);
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
          }, highlight(item.text, queryText.trim().toLowerCase()));

          return h('div', { ref: rootRef, style: ROOT_STYLE, 'data-dsh-prompt-peek': '' },
            h('style', { key: 'style' }, CSS),
            browse === null ? null : h('div', { key: 'pill', className: 'dsh-pp-pill' },
              h('span', { className: 'dsh-pp-pill__dot' }),
              h('span', null, translate('browse')),
              h('span', { className: 'dsh-pp-pill__count' }, (browse.index + 1) + '/' + browse.total),
              h('span', { className: 'dsh-pp-pill__hint' }, translate('browseHint')),
            ),
            panelOpen ? h('div', { key: 'panel', ref: panelRef, className: 'dsh-pp-panel', role: 'dialog', 'aria-label': translate('title') },
              h('div', { className: 'dsh-pp-head' },
                h('span', { className: 'dsh-pp-title' }, translate('title')),
                h('span', { className: 'dsh-pp-count' }, matches.length === 0 ? translate('emptyShort') : ((selected + 1) + ' / ' + matches.length)),
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
                }),
              ),
              h('div', { ref: listRef, id: 'dsh-pp-listbox', className: 'dsh-pp-list', role: 'listbox' },
                matches.length === 0
                  ? h('div', { className: 'dsh-pp-empty' }, translate('empty'))
                  : matches.map(row),
              ),
              previewVisible ? h('div', { key: 'preview', ref: previewRef, className: 'dsh-pp-preview' },
                h('div', { className: 'dsh-pp-preview__title' }, translate('previewTitle')),
                previewNodes === null
                  ? h('div', { className: 'dsh-pp-preview__empty' }, translate('previewMissing'))
                  : h('div', { className: 'dsh-pp-preview__body' }, previewNodes),
              ) : null,
              h('div', { className: 'dsh-pp-hint' },
                h('span', { className: 'dsh-pp-hint__group' }, keycap('↑'), keycap('↓'), translate('hintSelect')),
                h('span', { className: 'dsh-pp-hint__group' }, keycap(translate('keySpace')), translate(previewVisible ? 'hintHidePreview' : 'hintPreview')),
                h('span', { className: 'dsh-pp-hint__group' }, keycap('Shift'), keycap(translate('keySpace')), translate('hintTypeSpace')),
                previewVisible ? h('span', { className: 'dsh-pp-hint__group' }, keycap('PgUp'), keycap('PgDn'), translate('hintPage')) : null,
                h('span', { className: 'dsh-pp-hint__group' }, keycap('Enter'), translate('hintInsert')),
                h('span', { className: 'dsh-pp-hint__group' }, keycap('Esc'), translate('hintClose')),
              ),
            ) : null,
          );
        }

        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay',
          id: 'prompt-peek',
          order: 4,
        }, ComposerHistory));
      },
    };
  },
});
