/**
 * @adviverse/desktop — core ad loop for native desktop apps that host a webview
 * (Electron, Tauri, CEF, WKWebView, WebView2). Framework-agnostic: fetch → cache
 * → render → viewability → impression → click. The React and vanilla surfaces
 * are thin wrappers over this.
 *
 * Serving mirrors the terminal/IDE SDKs: an `ADVIVERSE_TAG` routes by prefix —
 * `ts_` (public serve token) and `ak_` (secret API key) go to the self-network
 * serve endpoint; anything else is treated as a publisher placement tag.
 */

export interface Ad {
  /** Headline — the line shown. */
  text: string;
  /** Optional secondary text. */
  body?: string;
  /** Call to action, e.g. "Try free". */
  cta?: string;
  brand?: string;
  /** Tracked /click redirect — open this in the default browser on click. */
  url?: string;
  /** Compact /c/<code> link (fallback). */
  short_url?: string;
  /** GET this once when the ad is actually displayed (viewability). */
  impression_url?: string;
  /** Disclosure marker, e.g. "ad". */
  label: string;
  /** Seconds the ad may be cached/shown. */
  ttl: number;
}

export interface AdviverseConfig {
  /** ts_ serve token | ak_ API key | publisher placement tag. Required. */
  token: string;
  /** Stable per-install id. Auto-generated + persisted (localStorage) if omitted. */
  uid?: string;
  /** Privacy signals passed through to serving (GDPR TCF string / US Privacy). */
  consent?: { gdpr?: string; usPrivacy?: string };
  /** SHA-256 of a lowercased email, for cross-surface identity (opt-in). */
  emailSha256?: string;
  /** Override the serve base (default https://serve.adviverse.com). */
  base?: string;
  /** Fetch timeout (default 2500ms). Never blocks the UI regardless. */
  timeoutMs?: number;
  /** App/client label for reporting + integrity (default "desktop"). */
  client?: string;
}

const DEFAULT_BASE = 'https://serve.adviverse.com';
const TTL_MS = 60_000; // network back-off; the widget re-renders from cache freely
const UID_KEY = 'adviverse_uid';

type Win = typeof globalThis & {
  localStorage?: Storage;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
  adviverse?: { openExternal?: (url: string) => void };
  open?: (url: string, target?: string, features?: string) => unknown;
};
const w = globalThis as Win;

function persistedUid(): string {
  try {
    const cur = w.localStorage?.getItem(UID_KEY);
    if (cur) return cur;
  } catch { /* no storage */ }
  const id = 'ins_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  try { w.localStorage?.setItem(UID_KEY, id); } catch { /* ignore */ }
  return id;
}

interface CacheEntry { at: number; ad: Ad | null }
const memCache = new Map<string, CacheEntry>();

function serveUrl(cfg: AdviverseConfig): { url: string; headers: Record<string, string> } {
  const base = cfg.base || DEFAULT_BASE;
  const q = new URLSearchParams({
    uid: cfg.uid || persistedUid(),
    client: cfg.client || 'desktop',
  });
  if (cfg.emailSha256) q.set('em', cfg.emailSha256);
  if (cfg.consent?.gdpr) q.set('gdpr_consent', cfg.consent.gdpr);
  if (cfg.consent?.usPrivacy) q.set('us_privacy', cfg.consent.usPrivacy);
  const headers: Record<string, string> = {};
  if (/^ts_/.test(cfg.token)) {
    q.set('token', cfg.token);
    return { url: `${base}/terminal/serve?${q}`, headers };
  }
  if (/^ak_/.test(cfg.token)) {
    headers['x-api-key'] = cfg.token;
    return { url: `${base}/terminal/serve?${q}`, headers };
  }
  q.set('tag', cfg.token);
  return { url: `${base}/terminal?${q}`, headers };
}

/**
 * Fetch an ad (cached ~60s per token so the network is hit at most once/minute).
 * Resolves to null on no-fill / offline / error — callers render nothing then.
 */
export async function fetchAd(cfg: AdviverseConfig): Promise<Ad | null> {
  const key = cfg.token;
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ad;

  let ad: Ad | null = null;
  try {
    const { url, headers } = serveUrl(cfg);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 2500);
    const res = await fetch(url, { headers, signal: ctrl.signal, credentials: 'omit' });
    clearTimeout(timer);
    const body = (await res.json()) as Partial<Ad>;
    if (body && body.text) ad = body as Ad;
  } catch {
    ad = null; // offline / timeout / no-fill — cache the miss to back off for TTL
  }
  memCache.set(key, { at: Date.now(), ad });
  return ad;
}

/** Open the ad's landing page in the user's DEFAULT browser (never in-app). */
export function openClick(ad: Ad): void {
  const url = ad.url || ad.short_url;
  if (!url) return;
  // Electron: the app's preload exposes window.adviverse.openExternal (@adviverse/electron;
  // @adviverse/tauri's installAdviverse() sets it too). Tauri v2: the opener plugin via
  // __TAURI_INTERNALS__.invoke; falls back to window.open if the plugin isn't registered.
  // Tauri v1 (withGlobalTauri): __TAURI__.shell.open. Else window.open.
  const fallback = () => w.open?.(url, '_blank', 'noopener,noreferrer');
  try {
    if (typeof w.adviverse?.openExternal === 'function') { w.adviverse.openExternal(url); return; }
    const invoke = (w.__TAURI_INTERNALS__ as { invoke?: (cmd: string, args: unknown) => Promise<unknown> } | undefined)?.invoke;
    if (typeof invoke === 'function') {
      if (/^https?:\/\//i.test(url)) invoke('plugin:opener|open_url', { url }).catch(fallback);
      return;
    }
    const tauriOpen = (w.__TAURI__ as { shell?: { open?: (u: string) => unknown } } | undefined)?.shell?.open;
    if (typeof tauriOpen === 'function') { tauriOpen(url); return; }
    fallback();
  } catch { /* best-effort */ }
}

/** Fire the impression beacon exactly once (idempotent per Ad object). */
export function fireImpression(ad: Ad & { __imp?: boolean }): void {
  if (ad.__imp || !ad.impression_url) return;
  ad.__imp = true;
  try { fetch(ad.impression_url, { credentials: 'omit', keepalive: true }).catch(() => {}); } catch { /* ignore */ }
}

/**
 * Watch an element and fire the impression once it is genuinely VIEWABLE: at
 * least 50% on-screen AND the window/tab visible AND focused, continuously for
 * `dwellMs` (MRC-style). Returns a disposer. Pure DOM — works in any webview.
 */
export function observeViewability(
  el: Element,
  ad: Ad,
  opts: { dwellMs?: number } = {},
): () => void {
  const dwell = opts.dwellMs ?? 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const visible = () =>
    (typeof document === 'undefined' || document.visibilityState === 'visible') &&
    (typeof document === 'undefined' || typeof document.hasFocus !== 'function' || document.hasFocus());

  const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const arm = () => {
    if (done || timer) return;
    timer = setTimeout(() => {
      if (!done && visible()) { done = true; fireImpression(ad); io.disconnect(); window.removeEventListener('blur', stop); }
    }, dwell);
  };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && e.intersectionRatio >= 0.5 && visible()) arm();
      else stop();
    }
  }, { threshold: [0, 0.5, 1] });
  io.observe(el);
  window.addEventListener('blur', stop);

  return () => { done = true; stop(); io.disconnect(); window.removeEventListener('blur', stop); };
}
