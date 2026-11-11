import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import { apply, normalizeSettings, settingsPath } from '../src/index.js';


const testHome = mkdtempSync(join(tmpdir(), 'dsh-prompt-peek-test-'));
process.env.DSH_HOME = testHome;
after(() => rmSync(testHome, { recursive: true, force: true }));

const DEFAULTS = {
  locale: 'auto',
  showPreview: true,
  smoothScroll: true,
  previewPageSize: 270,
  historyLimit: 300,
  browseOrder: 'newest',
};

/** Boot the Host half into a fake cordis context and return the settings route. */
function install(config, home = testHome) {
  process.env.DSH_HOME = home;
  const routes = new Map();
  const disposers = [];
  const effect = (fn) => {
    const dispose = fn();
    if (typeof dispose === 'function') disposers.push(dispose);
  };
  const ctx = {
    effect,
    // The plugin declares Connection inside an optional child fiber; the fake
    // context runs the child immediately with itself.
    inject(deps, callback) {
      assert.deepEqual(deps, ['connection']);
      callback({
        effect,
        connection: {
          fetch: {
            register(value) {
              routes.set(value.path, value);
              return async () => {};
            },
          },
        },
      });
    },
  };
  apply(ctx, config);
  const route = routes.get('/api/prompt-peek.settings');
  assert.ok(route, 'the settings route is registered');
  return { ctx, routes, route, disposers };
}

function request(method, body) {
  return new Request('http://127.0.0.1:65488/api/prompt-peek.settings', {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function freshHome() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-prompt-peek-home-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

test('settingsPath follows DSH_HOME', () => {
  assert.equal(settingsPath(), join(testHome, 'prompt-peek', 'settings.json'));
});

test('GET reports the defaults before anything is saved', async () => {
  const home = freshHome();
  const { route } = install(undefined, home);
  const response = await route.fetch(request('GET'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.values, DEFAULTS);
  assert.deepEqual(body.defaults, DEFAULTS);
  assert.equal(body.editable, true);
  assert.equal(body.path, join(home, 'prompt-peek', 'settings.json'));
});

test('POST saves a patch as a private file and GET reads it back', async () => {
  const home = freshHome();
  const { route } = install(undefined, home);
  const saved = await route.fetch(request('POST', {
    values: { locale: 'en', showPreview: false, previewPageSize: 240, browseOrder: 'oldest' },
  }));
  assert.equal(saved.status, 200);
  const body = await saved.json();
  assert.equal(body.saved, true);
  assert.equal(body.values.locale, 'en');
  assert.equal(body.values.showPreview, false);
  assert.equal(body.values.smoothScroll, true);

  const file = join(home, 'prompt-peek', 'settings.json');
  const stored = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(stored.locale, 'en');
  assert.equal(stored.previewPageSize, 240);
  assert.equal(stored.browseOrder, 'oldest');
  assert.equal(statSync(file).mode & 0o777, 0o600);

  const reread = await (await route.fetch(request('GET'))).json();
  assert.equal(reread.values.locale, 'en');
  assert.equal(reread.values.showPreview, false);
});

test('a saved file overrides the profile baseline without rewriting it', async () => {
  const home = freshHome();
  mkdirSync(join(home, 'prompt-peek'), { recursive: true });
  writeFileSync(join(home, 'prompt-peek', 'settings.json'), JSON.stringify({ historyLimit: 40 }));
  const { route } = install({ historyLimit: 500, showPreview: false }, home);
  const body = await (await route.fetch(request('GET'))).json();
  assert.equal(body.defaults.historyLimit, 500);
  assert.equal(body.defaults.showPreview, false);
  assert.equal(body.values.historyLimit, 40);
  assert.equal(body.values.showPreview, false);
});

test('reset removes the file and returns to the profile baseline', async () => {
  const home = freshHome();
  const { route } = install({ previewPageSize: 120 }, home);
  await route.fetch(request('POST', { values: { previewPageSize: 300 } }));
  const response = await route.fetch(request('POST', { reset: true }));
  const body = await response.json();
  assert.equal(body.values.previewPageSize, 120);
  assert.throws(() => readFileSync(join(home, 'prompt-peek', 'settings.json'), 'utf8'));
  // The slider's range and the Host's bounds agree.
  const accepted = await route.fetch(request('POST', { values: { previewPageSize: 1200 } }));
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).values.previewPageSize, 1200);
});

test('rejects malformed settings without touching the file', async () => {
  const home = freshHome();
  const { route } = install(undefined, home);

  const badLocale = await route.fetch(request('POST', { values: { locale: 'fr' } }));
  assert.equal(badLocale.status, 400);
  assert.deepEqual(await badLocale.json(), { error: 'invalid_setting', field: 'locale' });

  const badOrder = await route.fetch(request('POST', { values: { browseOrder: 'random' } }));
  assert.equal(badOrder.status, 400);
  assert.deepEqual(await badOrder.json(), { error: 'invalid_setting', field: 'browseOrder' });

  const badBoolean = await route.fetch(request('POST', { values: { showPreview: 'yes' } }));
  assert.equal(badBoolean.status, 400);
  assert.deepEqual(await badBoolean.json(), { error: 'invalid_setting', field: 'showPreview' });

  const outOfRange = await route.fetch(request('POST', { values: { previewPageSize: 5 } }));
  assert.equal(outOfRange.status, 400);
  assert.deepEqual(await outOfRange.json(), { error: 'out_of_range', field: 'previewPageSize' });

  const fractional = await route.fetch(request('POST', { values: { historyLimit: 1.5 } }));
  assert.equal(fractional.status, 400);
  assert.deepEqual(await fractional.json(), { error: 'invalid_setting', field: 'historyLimit' });

  const unknown = await route.fetch(request('POST', { values: { nope: true } }));
  assert.equal(unknown.status, 400);
  assert.deepEqual(await unknown.json(), { error: 'unknown_setting', field: 'nope' });

  const notJson = await route.fetch(new Request('http://127.0.0.1:65488/api/prompt-peek.settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  }));
  assert.equal(notJson.status, 400);
  assert.deepEqual(await notJson.json(), { error: 'invalid_json' });

  assert.throws(() => readFileSync(join(home, 'prompt-peek', 'settings.json'), 'utf8'));
});

test('a hand-edited file degrades field by field', async () => {
  const home = freshHome();
  mkdirSync(join(home, 'prompt-peek'), { recursive: true });
  writeFileSync(join(home, 'prompt-peek', 'settings.json'), JSON.stringify({
    locale: 'zh',
    historyLimit: 99999,
    showPreview: 'nope',
  }));
  const { route } = install(undefined, home);
  const body = await (await route.fetch(request('GET'))).json();
  assert.equal(body.values.locale, 'zh');
  assert.equal(body.values.historyLimit, DEFAULTS.historyLimit);
  assert.equal(body.values.showPreview, DEFAULTS.showPreview);
});

test('normalizeSettings validates partial patches against the current values', () => {
  assert.deepEqual(normalizeSettings({ locale: 'zh' }, DEFAULTS), { values: { ...DEFAULTS, locale: 'zh' } });
  assert.deepEqual(normalizeSettings(null, DEFAULTS), { error: 'invalid_settings' });
  assert.deepEqual(normalizeSettings({ locale: 'auto' }, DEFAULTS).values.locale, 'auto');
});

test('the route registration is disposed with the plugin', async () => {
  const home = freshHome();
  const { disposers } = install(undefined, home);
  assert.equal(disposers.length, 1);
  await disposers[0]();
});

test('a profile without Connection still loads the plugin', () => {
  // The route lives in an optional child fiber, so `apply` must not throw when
  // the service is absent (nor register anything).
  assert.doesNotThrow(() => apply({ effect() {}, inject() {} }, {}));
});

test('the reply preview shares one parser with the history and survives interleaved events', () => {
  // The client half has no browser in this runner. These are source-level
  // guards for a regression that shipped once: history and preview walked the
  // event window with two different filters, so an event between a prompt and
  // its answer (an edit, a replacement, a tool call) hid the answer and the
  // panel said "no text reply".
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
  const readMessages = source.indexOf('function readMessages(');
  const readHistory = source.indexOf('function readHistory(');
  const readReply = source.indexOf('function readReply(');
  assert.ok(readMessages > 0 && readHistory > readMessages && readReply > readHistory);
  // Both readers go through the shared scan.
  assert.ok(source.slice(readHistory, readReply).includes('of readMessages(sessions, sessionId)'));
  assert.ok(source.slice(readReply, readReply + 400).includes('const messages = readMessages(sessions, sessionId);'));
  // The preview no longer keys on a filtered `surfaceOp === 'append'` walk.
  const replyBody = source.slice(readReply, source.indexOf('/** First match highlighted', readReply));
  assert.doesNotMatch(replyBody, /surfaceOp !== 'append'/u);
});
