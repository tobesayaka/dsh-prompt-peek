import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Host half of `dsh-prompt-peek`.
 *
 * The composer behavior (arrow-key recall, `Ctrl+R` search, `Space` preview)
 * lives in the browser half. This half owns one thing: the plugin's own
 * settings document, surfaced on the Settings page through
 * `/api/prompt-peek.settings`.
 *
 * The plugin keeps its preferences in `<DSH_HOME>/prompt-peek/settings.json`
 * rather than the Host user settings document, because it may be installed from
 * a local checkout into several profiles while sharing one DSH home. Only the
 * plugin's own choices live there — UI language, preview panel, smooth paging,
 * page size, history length, the result order, and whether the query also
 * matches replies — never session text, prompts, or replies.
 *
 * The route is registered on Connection's shared `/api` handler, so it inherits
 * the browser cookie, Host/Origin checks, and Peer admission, like the other
 * plugin routes.
 */

/** Accepted values of the plugin language preference. `auto` follows DSH's active locale. */
export const LOCALE_VALUES = Object.freeze(['auto', 'zh', 'en']);

/**
 * Accepted values of the history order. `oldest` lists results oldest first,
 * which ARIA expects of a listbox popup; `newest` keeps the shell-like order
 * where the last prompt sits next to the composer.
 */
export const BROWSE_ORDER_VALUES = Object.freeze(['newest', 'oldest']);

const DEFAULTS = Object.freeze({
  /** `auto` follows DSH's active locale; `zh` / `en` pin the plugin's copy. */
  locale: 'auto',
  /** Show the reply preview column inside the search panel. */
  showPreview: true,
  /** Let the search query match the reply text as well as the prompt. */
  searchAnswers: false,
  /** Glide the preview between pages instead of jumping. */
  smoothScroll: true,
  /**
   * Pixels one PgUp / PgDn moves the reply preview; a wheel notch moves a
   * quarter. The default is fifteen preview lines (15 x 18px).
   */
  previewPageSize: 270,
  /** Most recent prompts read from the session for recall. */
  historyLimit: 300,
  /** List search results oldest first (ARIA listbox order) or newest first. */
  browseOrder: 'newest',
});

const SETTINGS_LIMITS = {
  previewPageSize: [60, 1200],
  historyLimit: [20, 1000],
};

const SETTINGS_KEYS = new Set(Object.keys(DEFAULTS));

/** Where the plugin keeps its own preferences: `<DSH_HOME>/prompt-peek/settings.json`. */
export function settingsPath() {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh');
  return join(home, 'prompt-peek', 'settings.json');
}

/**
 * Validate a partial settings patch against the current values.
 * @param {unknown} input
 * @param {Record<string, any>} current
 * @returns {{ values: Record<string, any> } | { error: string, field?: string }}
 */
export function normalizeSettings(input, current) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'invalid_settings' };
  }
  const values = { ...current };
  for (const key of Object.keys(input)) {
    if (!SETTINGS_KEYS.has(key)) return { error: 'unknown_setting', field: key };
    const value = input[key];
    if (key === 'locale') {
      if (typeof value !== 'string' || !LOCALE_VALUES.includes(value)) return { error: 'invalid_setting', field: key };
      values[key] = value;
      continue;
    }
    if (key === 'browseOrder') {
      if (typeof value !== 'string' || !BROWSE_ORDER_VALUES.includes(value)) return { error: 'invalid_setting', field: key };
      values[key] = value;
      continue;
    }
    if (key === 'showPreview' || key === 'smoothScroll' || key === 'searchAnswers') {
      if (typeof value !== 'boolean') return { error: 'invalid_setting', field: key };
      values[key] = value;
      continue;
    }
    const range = SETTINGS_LIMITS[key];
    if (range === undefined) return { error: 'unknown_setting', field: key };
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
      return { error: 'invalid_setting', field: key };
    }
    if (value < range[0] || value > range[1]) return { error: 'out_of_range', field: key };
    values[key] = value;
  }
  return { values };
}

/**
 * Read and validate a stored document. Unknown or out-of-range fields are
 * dropped so a hand-edited file degrades to the defaults instead of failing the
 * whole plugin.
 * @param {string} file
 * @returns {Record<string, any> | undefined}
 */
function readStoredSettings(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  // Only the file's own fields come back: the caller layers them over the
  // profile baseline, so an absent field keeps the baseline value.
  const values = {};
  for (const key of Object.keys(parsed)) {
    const single = normalizeSettings({ [key]: parsed[key] }, DEFAULTS);
    if (single.error === undefined) values[key] = single.values[key];
  }
  return values;
}

/** Write through a temporary file so a crash never leaves a truncated document. */
function writeStoredSettings(file, values) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.tmp-' + process.pid + '-' + Date.now();
  writeFileSync(temporary, JSON.stringify(values, null, 2) + '\n', { mode: 0o600 });
  renameSync(temporary, file);
}

/** Merge the cordis.patch.yml `config` baseline with the stored overrides. */
function resolveInitialOptions(config) {
  const options = { ...DEFAULTS };
  const source = config === null || config === undefined ? {} : config;
  const single = normalizeSettings(
    Object.fromEntries(Object.keys(DEFAULTS).filter((key) => source[key] !== undefined).map((key) => [key, source[key]])),
    options,
  );
  if (single.error === undefined) Object.assign(options, single.values);
  return options;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * `GET /api/prompt-peek.settings` reports the current values, the profile
 * baseline, and the file path; `POST` saves a patch, or `{ reset: true }` clears
 * the file back to the profile baseline.
 */
async function settingsRoute(options, baseOptions, file, request) {
  const envelope = () => ({
    values: { ...options },
    defaults: { ...baseOptions },
    editable: true,
    path: file,
  });
  if (request.method === 'GET') return json(envelope());
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (body !== null && typeof body === 'object' && body.reset === true) {
    try {
      rmSync(file, { force: true });
    } catch {
      return json({ error: 'settings_reset_failed' }, 500);
    }
    Object.assign(options, baseOptions);
    return json({ ...envelope(), saved: true });
  }
  const normalized = normalizeSettings(body === null || typeof body !== 'object' ? undefined : body.values, options);
  if (normalized.error !== undefined) {
    return json({ error: normalized.error, field: normalized.field }, 400);
  }
  try {
    writeStoredSettings(file, normalized.values);
  } catch {
    return json({ error: 'settings_write_failed' }, 500);
  }
  Object.assign(options, normalized.values);
  return json({ ...envelope(), saved: true });
}

/** Host plugin entry. @param {import('cordis').Context} ctx */
export function apply(ctx, config = {}) {
  const options = resolveInitialOptions(config);
  const baseOptions = { ...options };
  const file = settingsPath();
  const storedSettings = readStoredSettings(file);
  if (storedSettings !== undefined) Object.assign(options, storedSettings);

  // The settings route needs Connection. Declaring it inside an optional child
  // fiber keeps the whole plugin loading in profiles without it (older shells,
  // CLI-only compositions) instead of failing the Loader entry.
  ctx.inject(['connection'], (scope) => {
    scope.effect(() => {
      const dispose = scope.connection.fetch.register({
        path: '/api/prompt-peek.settings',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => settingsRoute(options, baseOptions, file, request),
      });
      return () => {
        void dispose();
      };
    }, 'prompt-peek: settings route');
  });
}
