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
  composerDictionary,
  settingsDictionary,
  effectiveLanguage,
  translateKey,
  makeTranslate,
  pageDirection,
  pagePlan: pagePlanOf,
  glideFrame,
  glideStep,
  stepIndex,
  readHistory,
} = loadClient();

/** The helpers run in a `vm` realm, so their plain objects are not this realm's prototypes. */
const pagePlan = (...args) => ({ ...pagePlanOf(...args) });

/** A locale face like the host's `LocaleRuntime`, minus the browser plumbing. */
function localeFace(active, dictionaries = {}) {
  return {
    getSnapshot: () => ({ active, revision: 1, locales: [] }),
    bind: (ns) => (key) => {
      const table = dictionaries[ns];
      // The host echoes the key when the namespace has no entry.
      return table !== undefined && Object.hasOwn(table, key) ? table[key] : key;
    },
    subscribe: () => () => {},
  };
}

function context(face) {
  return {
    get: (name) => (name === 'locale' ? face : undefined),
  };
}

test('the language follows DSH under auto, and the pin wins over DSH', () => {
  assert.equal(effectiveLanguage(context(localeFace('zh')), 'auto'), 'zh');
  assert.equal(effectiveLanguage(context(localeFace('zh-CN')), 'auto'), 'zh');
  assert.equal(effectiveLanguage(context(localeFace('en')), 'auto'), 'en');
  assert.equal(effectiveLanguage(context(localeFace('zh')), 'en'), 'en');
  assert.equal(effectiveLanguage(context(localeFace('en')), 'zh'), 'zh');
  // No locale service at all (older shell, plain browser): English, not a crash.
  assert.equal(effectiveLanguage({ get: () => undefined }, 'auto'), 'en');
});

test('auto on a Chinese interface shows Chinese even when the host echoes the key', () => {
  const t = makeTranslate(context(localeFace('zh')), 'auto');
  assert.equal(t('title'), '搜索已发送的消息');
  assert.equal(t('hintPage'), '翻页');
  assert.equal(t('previewTitle'), 'dsh 的回答');
});

test('auto prefers a host translation and falls back to the active language', () => {
  const dictionaries = { 'dsh-prompt-peek': { title: '自定义标题' } };
  const translated = translateKey('auto', 'title', (key) => dictionaries['dsh-prompt-peek'][key] ?? key, composerDictionary('zh'));
  assert.equal(translated, '自定义标题');
  const fellBack = translateKey('auto', 'title', (key) => 'dsh-prompt-peek.' + key, composerDictionary('zh'));
  assert.equal(fellBack, '搜索已发送的消息');
  const sameKey = translateKey('auto', 'title', (key) => key, composerDictionary('zh'));
  assert.equal(sameKey, '搜索已发送的消息');
});

test('auto follows a DSH language switch without a remount', () => {
  let active = 'en';
  const face = {
    getSnapshot: () => ({ active, revision: 1 }),
    bind: () => (key) => key,
    subscribe: () => () => {},
  };
  const t = makeTranslate(context(face), 'auto');
  assert.equal(t('title'), 'Search sent messages');
  active = 'zh';
  assert.equal(t('title'), '搜索已发送的消息');
});

test('a pinned language ignores DSH, and never leaks an English fallback', () => {
  const onEnglish = makeTranslate(context(localeFace('en')), 'zh');
  assert.equal(onEnglish('title'), '搜索已发送的消息');
  assert.equal(onEnglish('hintPage'), '翻页');
  const onChinese = makeTranslate(context(localeFace('zh')), 'en');
  assert.equal(onChinese('title'), 'Search sent messages');
  assert.equal(onChinese('hintPage'), 'page');
});

test('every key the panel asks for exists in both languages', () => {
  const zh = composerDictionary('zh');
  const en = composerDictionary('en');
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) assert.notEqual(zh[key], '', key);
  const zhSettings = settingsDictionary('zh');
  const enSettings = settingsDictionary('en');
  assert.deepEqual(Object.keys(zhSettings).sort(), Object.keys(enSettings).sort());
  assert.notEqual(zhSettings.settingsNav, enSettings.settingsNav);
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
