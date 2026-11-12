import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

/**
 * The client half is a browser module. Its factory returns pure helpers, so it
 * loads here inside a minimal module-loader sandbox: no DOM, no React, no slot
 * runtime. Anything the tests touch must stay free of `window`/`document`.
 */
function loadClient() {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
  let api;
  const sandbox = {
    console,
    window: {
      __ModuleLoader__: {
        load(definition) {
          api = definition.factory(() => ({}));
        },
      },
    },
  };
  vm.runInNewContext(source, sandbox);
  assert.ok(api, 'the client entry registered through the module loader');
  return api.internals;
}

const {
  DICTIONARY,
  NS,
  translateKey,
  pageDirection,
  pagePlan: pagePlanOf,
  glideFrame,
  glideStep,
  stepIndex,
  browseStep: browseStepOf,
  filterHistory: filterHistoryOf,
  ownsComposerKey,
  readMessages,
  readHistory,
  CSS,
  panelHeight: panelHeightOf,
} = loadClient();

/** The helpers run in a `vm` realm, so their plain objects are not this realm's prototypes. */
const browseStep = (mode, delta) => {
  const result = browseStepOf(mode, delta);
  return {
    ...result,
    mode: result.mode === null ? null : { ...result.mode },
  };
};
const filterHistory = (items, query, options) => filterHistoryOf(items, query, options).map((item) => ({ ...item }));

/** The helpers run in a `vm` realm, so their plain objects are not this realm's prototypes. */
const pagePlan = (...args) => ({ ...pagePlanOf(...args) });
const panelHeight = (...args) => ({ ...panelHeightOf(...args) });

/** A locale service like the host's `LocaleRuntime`, minus the browser plumbing. */
function localeService(initial = 'zh', dictionaries = {}) {
  let active = initial;
  let revision = 1;
  // The registered namespace answers from the active locale, falling back to
  // English; `dictionaries` overrides a namespace for one test.
  const bind = (ns) => (key) => {
    const override = dictionaries[ns];
    if (override !== undefined) return Object.hasOwn(override, key) ? override[key] : key;
    if (ns !== NS) return key;
    return DICTIONARY[active]?.[key] ?? DICTIONARY.en[key] ?? key;
  };
  return {
    register: () => {},
    bind,
    getSnapshot: () => ({ active, revision }),
    subscribe: () => () => {},
    setActive(next) { active = next; revision += 1; },
  };
}

test('copy comes from the service, so DSH\'s active locale decides the language', () => {
  const onChinese = localeService('zh');
  assert.equal(translateKey(onChinese.bind(NS), 'title'), '搜索已发送的消息');
  assert.equal(translateKey(onChinese.bind(NS), 'hintPage'), '翻页');
  const onEnglish = localeService('en');
  assert.equal(translateKey(onEnglish.bind(NS), 'title'), 'Search sent messages');
  assert.equal(translateKey(onEnglish.bind(NS), 'hintPage'), 'page');
});

test('a DSH language switch is read on the next call, without a remount', () => {
  const service = localeService('en');
  const t = (key) => translateKey(service.bind(NS), key);
  assert.equal(t('title'), 'Search sent messages');
  service.setActive('zh');
  assert.equal(t('title'), '搜索已发送的消息');
});

test('a host translation wins, and a missing dictionary falls back to the built-in table', () => {
  const custom = localeService('zh', { [NS]: { title: '自定义标题' } });
  assert.equal(translateKey(custom.bind(NS), 'title'), '自定义标题');
  const missing = { bind: () => (key) => key };
  assert.equal(translateKey(missing.bind(NS), 'title'), 'Search sent messages');
  // A settings-namespace echo is not copy either.
  const echoed = { bind: () => (key) => NS + '.' + key };
  assert.equal(translateKey(echoed.bind(NS), 'title'), 'Search sent messages');
});

test('placeholders are filled from params, and a missing param stays literal', () => {
  const service = localeService('en');
  const t = (key, params) => translateKey(service.bind(NS), key, params);
  assert.equal(t('previewPageSizeValue', { value: 270 }), '270 px');
  assert.equal(t('historyLimitValue', { value: 300 }), '300 prompts');
  assert.equal(t('historyLimitValue'), '{value} prompts');
  service.setActive('zh');
  assert.equal(t('historyLimitValue', { value: 300 }), '300 条');
});

test('the one namespace carries every key the panel and the Settings page ask for, in both languages', () => {
  assert.deepEqual(Object.keys(DICTIONARY.zh).sort(), Object.keys(DICTIONARY.en).sort());
  for (const key of Object.keys(DICTIONARY.en)) {
    assert.notEqual(DICTIONARY.en[key], '', key);
    assert.notEqual(DICTIONARY.zh[key], '', key);
  }
  // A shared with the composer panel, so the same key cannot name two things.
  assert.equal(DICTIONARY.zh.settingsNav, '输入框速览');
  assert.equal(DICTIONARY.en.settingsNav, 'Prompt peek');
});

test('PgUp and PgDn page the preview, open it when hidden, and never do nothing', () => {
  assert.equal(pageDirection('PageUp'), -1);
  assert.equal(pageDirection('PageDown'), 1);
  assert.equal(pageDirection('ArrowUp'), 0);
  assert.deepEqual(pagePlan(pageDirection('PageDown'), true, true, false), { action: 'scroll', delta: 1 });
  assert.deepEqual(pagePlan(pageDirection('PageUp'), true, true, false), { action: 'scroll', delta: -1 });
  // Hidden preview: the press opens it instead of falling through silently.
  assert.deepEqual(pagePlan(pageDirection('PageUp'), false, true, true), { action: 'open', delta: -1 });
  // At the edge: stop there. Paging one reply never moves to the next prompt.
  assert.deepEqual(pagePlan(pageDirection('PageDown'), true, true, true), { action: 'edge', delta: 1 });
  assert.deepEqual(pagePlan(pageDirection('PageUp'), true, true, true), { action: 'edge', delta: -1 });
  // Previews off in Settings: the key keeps its native meaning.
  assert.deepEqual(pagePlan(pageDirection('PageDown'), true, false, false), { action: 'none', delta: 1 });
  assert.deepEqual(pagePlan(0, true, true, false), { action: 'none', delta: 0 });
});

/**
 * The glide as `scrollPreviewBy` runs it, line for line: the same `glideFrame`
 * decision, the same running-loop takeover, and the same `step` loop. A press
 * that finds a running glide never starts a second loop; it only retargets.
 */
function glide({ tau = 100 } = {}) {
  const scroller = { scrollTop: 0, scrollHeight: 2000, clientHeight: 300 };
  const animation = { frame: null, target: 0 };
  const limit = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const stop = () => {
    if (animation.frame !== null) clearTimeout(animation.frame);
    animation.frame = null;
  };
  const step = () => {
    animation.target = Math.min(animation.target, limit());
    const remaining = animation.target - scroller.scrollTop;
    if (Math.abs(remaining) < 1) {
      scroller.scrollTop = animation.target;
      animation.frame = null;
      return;
    }
    // The component's own per-frame step: whole pixels in the travel's sign.
    const applied = glideStep(remaining, 16, tau);
    const before = scroller.scrollTop;
    scroller.scrollTop = before + applied;
    if (scroller.scrollTop === before) {
      animation.frame = null;
      return;
    }
    if (Math.abs(remaining) - Math.abs(applied) < 1) {
      scroller.scrollTop = animation.target;
      animation.frame = null;
      return;
    }
    animation.frame = 1;
  };
  const press = (delta, repeat = false) => {
    const frame = { ...glideFrame(scroller, animation.target, delta, repeat) };
    if (frame.atEdge) {
      stop();
      return false;
    }
    animation.target = frame.target;
    if (animation.frame !== null) return true;
    animation.frame = 1;
    return true;
  };
  /** Run frames until the glide finishes; returns every scrollTop painted. */
  const frames = (max = 2_000) => {
    const seen = [];
    for (let index = 0; index < max && animation.frame !== null; index += 1) {
      step();
      if (animation.frame !== null) seen.push(scroller.scrollTop);
    }
    return seen;
  };
  return { scroller, animation, press, step, frames, stop };
}

test('PgUp during a PgDn glide turns it around instead of continuing down', () => {
  for (const held of [false, true]) {
    const s = glide();
    s.press(270);
    s.step();
    s.step();
    const down = s.scroller.scrollTop;
    assert.ok(down > 0 && down < 270, 'PgDn is still gliding');
    // The regression cancelled (or extended) the glide in place: with
    // `from = running ? target : scrollTop` the target sat *below* the
    // position, so the preview kept travelling down after a PgUp.
    assert.equal(s.press(-270, held), true);
    assert.ok(s.animation.target <= down, held ? 'a held PgUp does not keep gliding down' : 'a fresh PgUp targets above the position');
    const after = s.frames();
    assert.ok(after.every((top, index) => index === 0 || top <= after[index - 1]), 'the glide never moves down again');
    assert.equal(s.scroller.scrollTop, 0, 'it lands at the top');
    assert.equal(s.animation.frame, null, 'and stops');
  }
});

test('an upward glide step is negative, never +1', () => {
  // 0.3.3 shipped `Math.ceil` on the negative advance and clamped it to +1, so
  // a PgUp walked the preview DOWN one pixel per frame forever.
  for (const remaining of [-1.01, -1.5, -5, -39, -117, -270]) {
    const step = glideStep(remaining, 16, 100);
    assert.ok(step < 0, `${remaining}px to travel moves up, got ${step}`);
    assert.ok(Math.abs(step) <= Math.abs(remaining), 'a frame never overshoots its target');
  }
  // Downward travel is positive, and both directions agree on magnitude.
  for (const remaining of [1.01, 5, 117, 270]) {
    const step = glideStep(remaining, 16, 100);
    assert.ok(step > 0, `${remaining}px to travel moves down`);
    assert.equal(step, -glideStep(-remaining, 16, 100), 'up and down cover the same distance');
  }
  // Sub-pixel remainders are handed to the landing branch, not stepped.
  assert.equal(glideStep(0.4, 16, 100), 0);
  assert.equal(glideStep(-0.4, 16, 100), 0);
});

test('PgUp from a scrolled preview lands on the top, frame by frame', () => {
  const s = glide();
  s.scroller.scrollTop = 600;
  assert.equal(s.press(-270), true);
  const frames = s.frames();
  assert.ok(frames.length > 0);
  for (let index = 1; index < frames.length; index += 1) {
    assert.ok(frames[index] < frames[index - 1], `frame ${index} moved up (${frames[index - 1]} -> ${frames[index]})`);
  }
  assert.equal(s.scroller.scrollTop, 330, 'one PgUp travels exactly one page');
  assert.equal(s.animation.frame, null);
});

test('a held PgUp turns a running downward glide around', () => {
  const s = glide();
  s.press(270);
  s.step();
  // Auto-repeat of PgDown keeps one page of lead, never stacks pages.
  s.press(270, true);
  s.press(270, true);
  assert.ok(s.animation.target <= 540, 'repeats do not stack pages');
  // A held PgUp while the preview is still travelling down: the press targets
  // the position itself, not a stale target behind it.
  const before = s.scroller.scrollTop;
  s.press(-270, true);
  assert.ok(s.animation.target <= before, 'the repeat never keeps gliding down');
});

test('a key repeat holds the running target, and releasing stops the glide', () => {
  const s = glide();
  s.press(270);
  s.step();
  // A repeat continues the running glide and keeps exactly one page of lead.
  s.press(270, true);
  assert.equal(s.animation.target, s.scroller.scrollTop + 270);
  // Pressing against a held glide never swings it past the current position.
  const back = glideFrame(s.scroller, s.animation.target, -270, true);
  assert.ok(back.target <= s.scroller.scrollTop, 'a repeated PgUp does not reverse the glide');
  // Key-up stops the glide where it is.
  const beforeRelease = s.scroller.scrollTop;
  s.stop();
  assert.equal(s.animation.frame, null);
  assert.equal(s.frames().length, 0, 'no frames run after the release');
  assert.equal(s.scroller.scrollTop, beforeRelease);
});

test('the glide stops instead of spinning when the reply cannot scroll further', () => {
  const s = glide();
  s.press(270);
  s.frames();
  assert.equal(s.animation.frame, null, 'PgDn lands and stops');
  assert.equal(s.scroller.scrollTop, 270);
  // At the top edge a PgUp asks the caller to step the selection, not animate.
  s.scroller.scrollTop = 0;
  assert.equal(s.press(-270), false);
  assert.equal(s.animation.frame, null);
  // At the bottom edge a PgDn does the same.
  s.scroller.scrollTop = 1700;
  assert.equal(s.press(270), false);
  assert.equal(s.animation.frame, null);
});

test('a short reply (nothing to scroll) never starts a glide', () => {
  const s = glide();
  s.scroller.scrollHeight = 280;
  assert.equal(s.press(270), false);
  assert.equal(s.animation.frame, null);
});

// R5: the panel and ↑ must cover the configured history limit, not only the
// page the Host happened to buffer. The plugin asks the Host for older pages
// through the Session's public `loadOlder()`; this fake mirrors that surface.
function fakeSession({ pages, hasMore = true, seed = [] }) {
  const users = seed.slice();
  const service = { loads: 0 };
  const state = { hasMore, loadingOlder: false };
  const binding = {
    eventSource: {
      getSnapshot: () => ({
        hasMore: state.hasMore,
        entries: users.map((text) => ({
          type: 'event',
          event: { type: 'user/message', seq: users.length, data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } },
        })),
      }),
      subscribe: () => () => {},
    },
    session: {
      get hasMore() {
        return state.hasMore;
      },
      get loadingOlder() {
        return state.loadingOlder;
      },
      async loadOlder() {
        service.loads += 1;
        const page = pages.shift();
        if (page === undefined) {
          state.hasMore = false;
          return;
        }
        users.unshift(...page);
        if (pages.length === 0) state.hasMore = false;
      },
    },
  };
  service.binding = () => binding;
  // The live buffer, so a test can assert what the window holds.
  service.users = () => users;
  return service;
}

/** The messages `readMessages` would see, through the public snapshot only. */
function readMessagesFor(sessions) {
  return sessions.binding().eventSource.getSnapshot().entries.map((entry) => ({ role: 'user', text: entry.event.data.content[0].text }));
}

test('a session without older history never loops, and a short session stays short (R5)', async () => {
  const { loadHistory } = loadClient();
  const done = fakeSession({ pages: [], hasMore: false });
  await loadHistory(done, 's2', 100, async () => {});
  assert.equal(done.loads, 0, 'hasMore=false means no request');
  // A session that already holds the limit is not paged at all.
  const tiny = fakeSession({ pages: [['unused']], seed: ['only'] });
  await loadHistory(tiny, 's3', 1, async () => {});
  assert.equal(tiny.loads, 0, 'a window already at the limit asks for nothing');
});

test('loading counts prompts the same way the list does, and never double-loads (R5)', async () => {
  const { loadHistory, promptCount } = loadClient();
  // Consecutive duplicates fold into one history entry, as `readHistory` does.
  assert.equal(promptCount([{ role: 'user', text: 'a' }, { role: 'user', text: 'a' }, { role: 'user', text: 'b' }]), 2);
  // 2 buffered prompts + a page holding a duplicate pair plus one new prompt
  // = 2 duplicates folded to 1, so 2 + 2 = 4: still short of 5, so it asks once
  // more and the empty page ends the loop instead of spinning.
  const sessions = fakeSession({ pages: [['x', 'x', 'y'], []], seed: ['a', 'b'] });
  await loadHistory(sessions, 's4', 5, async () => {});
  assert.equal(sessions.loads, 2, 'it pulls the page that holds the new prompt, then stops');
});


// The walk `↑` / `↓` takes without the search panel: a shell history.
test('↑ and ↓ wrap around the walk, and ↓ past the newest entry returns to the draft', () => {
  // Three prompts, index 2 is the newest.
  assert.equal(stepIndex(2, -1, 3), 1, '↑ from the newest goes older');
  assert.equal(stepIndex(1, -1, 3), 0);
  assert.equal(stepIndex(0, -1, 3), 2, '↑ from the oldest wraps to the newest');
  assert.equal(stepIndex(2, 1, 3), -1, '↓ past the newest returns to the draft');
  assert.equal(stepIndex(-1, -1, 3), 2, 'from the draft, ↑ starts at the newest');
  assert.equal(stepIndex(-1, 1, 3), 0, 'from the draft, ↓ starts at the oldest');
  assert.equal(stepIndex(0, 1, 3), 1);
  assert.equal(stepIndex(1, 1, 3), 2);
  assert.equal(stepIndex(2, 1, 3), -1);
  assert.equal(stepIndex(0, -1, 1), 0, 'a single prompt wraps onto itself');
  assert.equal(stepIndex(0, 1, 1), -1);
  assert.equal(stepIndex(5, -1, 0), -1, 'an empty history never moves');
});

/** A sessions face whose event window holds only what the test seeded. */
function historyFace(messages) {
  const entries = messages.map((message, seq) => ({
    type: 'event',
    event: message.role === 'user'
      ? { type: 'user/message', seq, data: { source: { kind: 'user' }, content: [{ type: 'text', text: message.text }] } }
      : { type: 'assistant/message', seq, data: { message: { content: [{ type: 'text', text: message.text }] } } },
  }));
  return {
    binding: () => ({
      eventSource: { getSnapshot: () => ({ hasMore: false, entries }), subscribe: () => () => {} },
      session: null,
    }),
  };
}

test('each prompt carries the reply that followed it, and only up to the next prompt', () => {
  const face = historyFace([
    { role: 'user', text: 'first prompt' },
    { role: 'assistant', text: 'first reply' },
    { role: 'assistant', text: 'second block of the first reply' },
    { role: 'user', text: 'second prompt' },
    { role: 'assistant', text: 'second reply' },
  ]);
  const history = readHistory(face, 's1');
  assert.equal(history.length, 2);
  assert.equal(history[0].replyLower, 'first reply\n\nsecond block of the first reply');
  assert.equal(history[1].replyLower, 'second reply');
});

test('a prompt with no reply yet carries an empty replyLower, never a neighbour', () => {
  const face = historyFace([
    { role: 'user', text: 'answered' },
    { role: 'assistant', text: 'an answer' },
    { role: 'user', text: 'still waiting' },
  ]);
  const history = readHistory(face, 's1');
  assert.equal(history[1].lower, 'still waiting');
  assert.equal(history[1].replyLower, '');
});

// The walk's stashing rule, on the reducer itself: every way out returns the
// draft the composer held when the walk began.
const walkItems = [{ text: 'alpha' }, { text: 'beta' }, { text: 'gamma' }];
const started = (stash) => browseStep({ items: walkItems, index: -1, stash }, -1);

test('↑ from the draft opens the newest prompt and keeps the draft safe', () => {
  const first = started('my unsent draft');
  assert.equal(first.draft, 'gamma');
  assert.equal(first.mode.index, 2);
  assert.equal(first.mode.stash, 'my unsent draft');
});

test('every way out of the walk writes the stashed draft back', () => {
  const first = started('my unsent draft');
  // `Esc`, a click into the composer, and typing all leave with delta 0.
  const left = browseStep(first.mode, 0);
  assert.equal(left.mode, null);
  assert.equal(left.draft, 'my unsent draft');
  // `↓` past the newest entry leaves the same way.
  const older = browseStep(first.mode, -1);
  assert.equal(older.draft, 'beta');
  const wrapped = browseStep(browseStep(older.mode, -1).mode, -1);
  assert.equal(wrapped.draft, 'gamma');
  const past = browseStep(wrapped.mode, 1);
  assert.equal(past.mode, null);
  assert.equal(past.draft, 'my unsent draft');
  // `↑` wraps from the oldest back to the newest and never drops the stash.
  assert.equal(browseStep(older.mode, -1).mode.stash, 'my unsent draft');
});

test('a walk over an empty composer restores an empty draft, not a prompt', () => {
  const first = started('');
  const left = browseStep(first.mode, 0);
  assert.equal(left.draft, '');
});

test('walking with duplicates of the draft still restores exactly what was typed', () => {
  const items = [{ text: 'same' }, { text: 'other' }];
  const first = browseStep({ items, index: -1, stash: 'same' }, -1);
  assert.equal(first.draft, 'other');
  assert.equal(browseStep(first.mode, 0).draft, 'same');
});

test('Ctrl+R / Cmd+R belong to the composer only in its plain form', () => {
  assert.equal(ownsComposerKey({ key: 'r', ctrlKey: true }), 'open-search');
  assert.equal(ownsComposerKey({ key: 'R', ctrlKey: true }), 'open-search');
  assert.equal(ownsComposerKey({ key: 'r', metaKey: true }), 'open-search');
  // Another key, or another modifier riding along, is not the search shortcut.
  assert.equal(ownsComposerKey({ key: 'a', ctrlKey: true }), null);
  assert.equal(ownsComposerKey({ key: 'r' }), null);
  assert.equal(ownsComposerKey({ key: 'r', ctrlKey: true, shiftKey: true }), null);
  assert.equal(ownsComposerKey({ key: 'r', ctrlKey: true, altKey: true }), null);
  assert.equal(ownsComposerKey({ key: 'r', ctrlKey: true, metaKey: true }), null);
  // An IME composition or an already-consumed press keeps its own meaning.
  assert.equal(ownsComposerKey({ key: 'r', ctrlKey: true, isComposing: true }), null);
  assert.equal(ownsComposerKey({ key: 'r', ctrlKey: true, keyCode: 229 }), null);
  assert.equal(ownsComposerKey({ key: 'r', ctrlKey: true, defaultPrevented: true }), null);
});

const historyRows = [
  { text: 'fix the parser', lower: 'fix the parser', replyLower: 'the parser is fixed; run npm test' },
  { text: 'why is the build slow', lower: 'why is the build slow', replyLower: 'the cache layer misses' },
  { text: 'add a changelog entry', lower: 'add a changelog entry', replyLower: '' },
];

test('the query matches prompts only until "also search replies" is on', () => {
  // "cache" only appears in a reply; "parser" in a prompt and its reply.
  const texts = (rows) => [...rows.map((row) => row.text)];
  assert.deepEqual(texts(filterHistory(historyRows, 'cache')), []);
  assert.deepEqual(texts(filterHistory(historyRows, 'cache', { searchAnswers: true })), ['why is the build slow']);
  // A prompt match stays a prompt match, not an answer hit.
  const byPrompt = filterHistory(historyRows, 'parser', { searchAnswers: true });
  assert.deepEqual([...byPrompt.map((row) => [row.text, row.answerHit])], [['fix the parser', false]]);
  // Found only through the reply: marked, and only then.
  assert.deepEqual([...filterHistory(historyRows, 'cache', { searchAnswers: true }).map((row) => row.answerHit)], [true]);
});

test('the query is trimmed and case-insensitive, and an empty query lists everything', () => {
  const texts = (rows) => [...rows.map((row) => row.text)];
  assert.deepEqual(texts(filterHistory(historyRows, '  CHANGELOG ')), ['add a changelog entry']);
  assert.deepEqual(texts(filterHistory(historyRows, 'CACHE', { searchAnswers: true })), ['why is the build slow']);
  const all = filterHistory(historyRows, '');
  assert.equal(all.length, 3);
  assert.ok(all.every((row) => row.answerHit === false));
});

test('result order and the result cap apply before matching, as the panel lists them', () => {
  const texts = (rows) => [...rows.map((row) => row.text)];
  assert.deepEqual(texts(filterHistory(historyRows, '', { order: 'newest' })), ['add a changelog entry', 'why is the build slow', 'fix the parser']);
  assert.deepEqual(texts(filterHistory(historyRows, '', { order: 'oldest' })), ['fix the parser', 'why is the build slow', 'add a changelog entry']);
  assert.equal(filterHistory(historyRows, '', { limit: 2 }).length, 2);
});

test('a prompt without a reply can never match through the answer search', () => {
  const rows = [{ text: 'no reply', lower: 'no reply', replyLower: '' }];
  assert.equal(filterHistory(rows, 'anything', { searchAnswers: true }).length, 0);
});

test('tool calls and reasoning never reach the history, the preview, or the answer search', () => {
  // One human message, then an assistant message that mixes a text block with
  // a tool call and a reasoning block, the way the Host records them.
  const entries = [
    {
      type: 'event',
      event: { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'deploy it' }] } },
    },
    {
      type: 'event',
      event: {
        type: 'assistant/message',
        seq: 2,
        data: {
          message: {
            content: [
              { type: 'reasoning', text: 'SECRET-REASONING' },
              { type: 'tool-call', name: 'run', input: { command: 'SECRET-TOOL-COMMAND' } },
              { type: 'text', text: 'Deployed to staging.' },
            ],
          },
        },
      },
    },
  ];
  const face = {
    binding: () => ({
      eventSource: { getSnapshot: () => ({ hasMore: false, entries }), subscribe: () => () => {} },
      session: null,
    }),
  };
  const { messages } = readMessages(face, 's1');
  assert.deepEqual([...messages.map((message) => message.text)], ['deploy it', 'Deployed to staging.']);
  const rows = readHistory(face, 's1');
  assert.equal(rows[0].replyLower, 'deployed to staging.');
  assert.equal(filterHistory(rows, 'secret', { searchAnswers: true }).length, 0);
  assert.equal(filterHistory(rows, 'secret-tool', { searchAnswers: true }).length, 0);
  assert.deepEqual([...filterHistory(rows, 'staging', { searchAnswers: true }).map((row) => row.answerHit)], [true]);
});

/**
 * The search panel's own CSS, parsed into `selector → declarations`. The
 * helpers run in a `vm` realm, so this reads the raw text rather than objects.
 */
function cssRules() {
  const rules = new Map();
  // Balanced braces, so a nested block (a media query) is not mistaken for a
  // selector whose body then swallows the rules that follow it.
  for (const match of CSS.matchAll(/([^{}]+)\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g)) {
    const selector = match[1].trim().split(/\s*}\s*/).pop().trim();
    rules.set(selector, match[2]);
  }
  return rules;
}

/** One declaration of a selector, or `''` when it is absent. */
function css(rules, selector, property) {
  const body = rules.get(selector) ?? '';
  const found = body.match(new RegExp('(?:^|;)\\s*' + property + ':([^;]+)'));
  return found === null ? '' : found[1].trim();
}

/**
 * Lay out a column of flex items stacked from `start`, the way the panel's
 * `flex-direction: column` does: cap each item by `max-height`, give the free
 * space to `flex-grow`, then take the overflow back **only from items that may
 * shrink** (a shrink factor of 0 means they cannot) down to their `min-height`.
 * Whatever still does not fit spills past the bottom and is clipped.
 */
function column(items, growHeight) {
  const rows = items.map((item) => ({
    ...item,
    shrink: item.shrink === true ? 1 : 0,
    height: Math.min(item.max ?? Infinity, item.content),
  }));
  const free = growHeight - rows.reduce((sum, row) => sum + row.height, 0);
  if (free > 0) {
    const growers = rows.filter((row) => row.grow === true);
    for (const row of growers) row.height += free / growers.length;
  } else if (free < 0) {
    let needed = -free;
    for (const row of rows.filter((row) => row.shrink > 0)) {
      const take = Math.min(needed, row.height - (row.min ?? 0));
      row.height -= take;
      needed -= take;
    }
  }
  let top = 0;
  return rows.map((row) => {
    const box = { ...row, top };
    top += row.height;
    return box;
  });
}

/**
 * R9 — the panel must not snap to a new height while `↑` / `↓` swap replies.
 *
 * Chrome does not transition a content-sized `auto` height (checked against
 * Chrome 151: a swap inside `height:auto` reports no running animation), so the
 * panel is driven as an explicit pixel height instead. `panelHeight` is the one
 * rule that decides that number and when the panel falls back to `auto`.
 */
test('the panel glides between replies as a pixel height (R9)', () => {
  // Open and content-sized: the measured inner height is the panel's height.
  assert.deepEqual(panelHeight({ open: true, content: 557, viewport: 900, reduced: false }),
    { height: 557, animate: true });
  // The ceiling still applies: a long reply stops at min(80vh, 720px).
  assert.deepEqual(panelHeight({ open: true, content: 2000, viewport: 900, reduced: false }),
    { height: 720, animate: true });
  // A short window takes the share, not the constant.
  assert.deepEqual(panelHeight({ open: true, content: 2000, viewport: 500, reduced: false }),
    { height: 400, animate: true });
  // Closed: hand the box back to the stylesheet.
  assert.deepEqual(panelHeight({ open: false, content: 557, viewport: 900, reduced: false }),
    { height: null, animate: false });
  // Reduced motion: the same numbers, without the glide.
  assert.deepEqual(panelHeight({ open: true, content: 557, viewport: 900, reduced: true }),
    { height: 557, animate: false });
  // Nothing measured yet: leave the panel on auto rather than pin it to 0.
  assert.deepEqual(panelHeight({ open: true, content: 0, viewport: 900, reduced: false }),
    { height: null, animate: false });
});

/**
 * R9, second half: a reply swap must change the preview's content height, never
 * its ceiling. A ceiling in an absolute unit (`min(46vh,320px)`) re-snaps the
 * panel whenever a short reply follows a long one; a share of the panel does
 * not move as the reply does.
 */
test('the preview ceiling does not change size with the reply (R9)', () => {
  const cap = css(cssRules(), '.dsh-pp-preview', 'max-height');
  assert.doesNotMatch(cap, /\d(px|rem|em|vh|vw)\b/, 'the preview ceiling must not be absolute: ' + cap);
  assert.match(cap, /%/, 'the ceiling is a share of the panel: ' + cap);
});

test('an open reply preview never squeezes the prompt list to nothing (R8)', () => {
  const rules = cssRules();
  const panel = (rule) => css(rules, '.dsh-pp-panel', rule);
  const list = (rule) => css(rules, '.dsh-pp-list', rule);
  const row = (rule) => css(rules, '.dsh-pp-row', rule);
  const preview = (rule) => css(rules, '.dsh-pp-preview', rule);

  // The list must keep its own floor…
  const listFloor = list('min-height');
  assert.notEqual(listFloor, '0', 'the list needs a min-height instead of min-height:0');
  assert.match(listFloor, /px|em|rem/, 'the list floor must be an absolute length: ' + listFloor);
  // …and the rows must not be squashed below their own line either.
  // `flex: none` is `0 0 auto`; an explicit shrink factor is read on its own.
  const rowFlex = row('flex');
  const rowShrink = row('flex-shrink').startsWith('0') || rowFlex === 'none'
    || (rowFlex.split(/\s+/).length > 1 && rowFlex.split(/\s+/)[1] === '0');
  assert.ok(rowShrink, '.dsh-pp-row must not shrink: ' + (row('flex') || row('flex-shrink')));

  // The preview's ceiling must leave that floor room: a percentage of the
  // panel measured while the panel is at its cap cannot fit a floor too.
  const previewCap = preview('max-height');
  assert.match(previewCap, /%/, 'the preview cap should be a share of the panel');
  const share = Number(previewCap.match(/([\d.]+)%/)[1]) / 100;
  assert.ok(share < 0.5, 'the preview may take less than half the panel: ' + previewCap);

  // The panel's own ceiling comes from the component now (`panelHeight`), so
  // ask the rule rather than the stylesheet: on a 900px-tall window it is 720.
  const windowPX = 900;
  const capPX = panelHeight({ open: true, content: 100000, viewport: windowPX, reduced: false }).height;
  assert.ok(capPX > 0 && capPX < 100000, 'the panel keeps a finite cap: ' + capPX);
  const panelInner = capPX - 2 * parseFloat(css(rules, '.dsh-pp-panel', 'padding'));
  const chrome = 3 * parseFloat(css(rules, '.dsh-pp-panel', 'gap'));
  const rowHeight = parseFloat(css(rules, '.dsh-pp-row', 'height'));
  const previewCapPX = Number(previewCap.match(/\(([\d.]+)%/)?.[1] ?? '46') / 100 * panelInner;
  const boxes = column([
    { name: 'head', content: 18 },
    { name: 'search', content: 34 },
    { name: 'list', content: rowHeight * 2, grow: true, shrink: list('min-height') !== '0', min: parseFloat(list('min-height')) },
    { name: 'preview', content: 3000, max: previewCapPX },
    { name: 'hint', content: 16 },
  ], panelInner - chrome);

  const listBox = boxes.find((box) => box.name === 'list');
  const previewBox = boxes.find((box) => box.name === 'preview');
  assert.ok(listBox.height >= 3 * rowHeight, 'the list keeps three rows while the preview is open: ' + listBox.height.toFixed(0) + 'px');
  // The preview stays pageable: it is still cut off by its own scroller.
  assert.ok(previewBox.height <= previewCapPX + 0.5, 'the preview keeps its scroll ceiling: ' + previewBox.height.toFixed(0) + 'px');
  assert.ok(boxes.reduce((sum, box) => sum + box.height, 0) <= panelInner - chrome + 0.5,
    'the open preview does not overflow the capped panel');
});

/**
 * R9, the fragile part worth a guard: measuring must happen on a clone. In
 * Chrome 151, clearing the panel's `height` and writing it back in the same
 * task makes the browser treat the value as unchanged and cancels the glide;
 * measurement on an off-screen clone was the only form that kept it.
 */
test('the panel height is measured on a clone, never by resizing the panel (R9)', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function naturalHeight'), source.indexOf('/**\n     * The panel\'s height as an explicit pixel value'));
  assert.ok(body.includes('cloneNode'), 'naturalHeight measures a clone');
  assert.ok(body.includes("height = 'auto'"), 'the clone is laid out at natural height');
  assert.ok(body.includes('.remove()'), 'the clone leaves no node behind');
  const effect = source.slice(source.indexOf('Drive the panel as a pixel height'), source.indexOf('Scroll the row that carries'));
  assert.ok(effect.includes('naturalHeight(panel)'), 'the effect measures through naturalHeight');
  assert.ok(!/panel\.style\.height = ''/.test(effect), 'the effect must not resize the panel to measure it');
});

/**
 * R10 — a plugin whose `apply` throws mounts nothing, so one rejected locale
 * registration took `Ctrl+R` down with it.
 *
 * The locale service refuses a duplicate namespace/locale, which a re-apply of
 * this plugin alone (HMR, a reload) produces. `apply` registers the composer
 * overlay *after* the dictionaries, so an escape from `ctx.locale.register`
 * left the plugin mounted nowhere and the key silently dead.
 */
test('a duplicate locale registration never takes the composer overlay down (R10)', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
  let api;
  new Function('window', source)({ __ModuleLoader__: { load: (definition) => { api = definition.factory(() => ({})); } } });

  // The host's `register`, copied from @deepseek-ai/dsh-client-locale.
  const pattern = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
  const dicts = new Map();
  const locale = {
    register(ns, localeOrDicts, dict) {
      const pairs = typeof localeOrDicts === 'string' ? [[localeOrDicts, dict]] : Object.entries(localeOrDicts);
      for (const [id] of pairs) if (!pattern.test(id)) throw new Error('bad locale id');
      let locales = dicts.get(ns);
      if (locales === undefined) { locales = new Map(); dicts.set(ns, locales); }
      for (const [id] of pairs) if (locales.has(id.toLowerCase())) throw new Error('already has locale ' + id);
      for (const [id, entries] of pairs) locales.set(id.toLowerCase(), entries);
      return () => {};
    },
    bind: () => (key) => key,
    getSnapshot: () => ({ active: 'zh', revision: 1 }),
    subscribe: () => () => {},
  };
  const mount = () => {
    let overlays = 0;
    const ctx = {
      locale,
      effect: (fn) => { fn(); return () => {}; },
      get: () => undefined,
      slots: { inject: () => { overlays += 1; return () => {}; }, register: () => () => {} },
      emit() {}, on: () => () => {},
      fiber: {},
    };
    assert.doesNotThrow(() => api.apply(ctx), 'apply must survive a repeated registration');
    return overlays;
  };
  const first = mount();
  assert.ok(first > 0, 'the first apply mounts the composer overlay');
  assert.equal(mount(), first, 'a re-apply mounts exactly as much as the first one');
});

/**
 * R11 — the overlay crashed on mount with
 * `Cannot read properties of undefined (reading 'listeners')`.
 *
 * The locale service's `subscribe` is a class method over `this.listeners`
 * (`LocaleRuntime.subscribe(fn) { this.listeners.add(fn); ... }`). It was handed
 * to `useSyncExternalStore` bare, and React calls that callback without a
 * receiver: `this` was undefined and the composer overlay threw before painting.
 * `apply` itself still succeeded, so nothing but the browser console said why
 * `Ctrl+R` looked dead.
 */
test('the locale subscription survives being called without a receiver (R11)', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /React\.useSyncExternalStore\(\s*ctx\.locale\.subscribe\s*,/,
    'ctx.locale.subscribe must be wrapped, not handed over bare');

  // A stub shaped like the host's LocaleRuntime: the method needs its receiver.
  class LocaleStub {
    constructor() { this.listeners = new Set(); this.snapshot = { active: 'zh', revision: 0 }; }
    getSnapshot() { return this.snapshot; }
    subscribe(fn) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
    bind() { return (key) => key; }
    register() { return () => {}; }
  }
  let api;
  new Function('window', source)({ __ModuleLoader__: { load: (definition) => { api = definition.factory(() => ({})); } } });
  const locale = new LocaleStub();
  const ctx = {
    locale,
    effect: (fn) => { fn(); return () => {}; },
    get: () => undefined,
    slots: { inject: () => () => {}, register: () => () => {} },
    emit() {}, on: () => () => {},
    fiber: {},
  };
  assert.doesNotThrow(() => api.apply(ctx), 'apply mounts with a receiver-bound locale service');

  // What React does with a subscribe callback: call it with no `this` at all.
  const { subscribe } = locale;
  assert.throws(() => subscribe(() => {}), /listeners/, 'the bare method is the shape that crashed');
  // And what our wrapper must do instead.
  // `apply` already holds one subscription of its own (settings sync).
  const before = locale.listeners.size;
  const byWrapper = (notify) => locale.subscribe(notify);
  const off = byWrapper(() => {});
  assert.equal(locale.listeners.size, before + 1, 'the wrapped subscription registers');
  off();
  assert.equal(locale.listeners.size, before, 'and unregisters on cleanup');
});

/**
 * R12 — the plugin's Settings page rendered blank with
 * `ReferenceError: bind is not defined`.
 *
 * `createSettingsPage` builds `PromptPeekSettings`, which translates through a
 * `bind` captured in `apply`. A refactor dropped `bind` from the factory's
 * parameters while its body kept using it, so the page threw on its first
 * render — `npm test` never saw it, because no test executed the component.
 * This one runs the real component body against a minimal React stub.
 */
test('every mounted surface renders without a ReferenceError (R12)', () => {
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: 'Fragment',
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useRef: (init) => ({ current: init }),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect: () => {},
    useLayoutEffect: () => {},
    useSyncExternalStore: (_subscribe, get) => get(),
  };
  let api;
  new Function('window', source)({
    __ModuleLoader__: {
      load: (definition) => { api = definition.factory((id) => (id === 'react' ? React : {})); },
    },
  });

  class LocaleStub {
    constructor() { this.listeners = new Set(); this.snapshot = { active: 'zh', revision: 1 }; }
    getSnapshot() { return this.snapshot; }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    bind() { return (key) => key; }
    register() { return () => {}; }
  }
  const mounted = [];
  const ctx = {
    locale: new LocaleStub(),
    effect: (fn) => { fn(); return () => {}; },
    get: () => undefined,
    slots: {
      inject: (_name, fn) => { fn(); return () => {}; },
      register: (options, component) => { mounted.push({ id: options.id, component }); return () => {}; },
    },
    emit() {}, on: () => () => {}, fiber: {},
  };
  api.apply(ctx);

  const surfaces = mounted.filter((entry) => entry.id === 'prompt-peek');
  assert.ok(surfaces.length > 0, 'the plugin mounts its surfaces');
  // The Settings page is the surface that broke: it must be among the ones run.
  const settings = surfaces.find((entry) => entry.component !== undefined && entry.component !== null);
  assert.ok(settings, 'surface ids: ' + surfaces.map((entry) => entry.id).join(', '));
  for (const surface of surfaces) {
    if (typeof surface.component !== 'function') continue;
    assert.doesNotThrow(() => surface.component({}), 'surface "' + surface.id + '" renders');
  }
});
