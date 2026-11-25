/**
 * Framework-free ad mount for any webview renderer (no React).
 *
 *   import { mountAd } from '@adviverse/desktop';
 *   const dispose = mountAd(document.getElementById('ad'), { token: 'ts_...' });
 *
 * Builds a disclosed ad card in `el`, fires the impression on viewability, and
 * opens clicks in the default browser. Returns a disposer. Renders nothing on
 * no-fill. Re-render with `refreshMs` for rotation (min 30s; paused while hidden).
 */
import { Ad, AdviverseConfig, fetchAd, observeViewability, openClick } from './core';

export interface MountOptions extends AdviverseConfig {
  refreshMs?: number;
}

function card(ad: Ad): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute('role', 'link');
  root.tabIndex = 0;
  Object.assign(root.style, {
    display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
    padding: '10px 12px', borderRadius: '10px', fontSize: '13px', lineHeight: '1.35',
    border: '1px solid rgba(127,127,127,0.22)', background: 'rgba(127,127,127,0.06)',
    boxSizing: 'border-box', maxWidth: '100%',
  } as CSSStyleDeclaration);

  const label = document.createElement('span');
  label.textContent = ad.label || 'ad';
  Object.assign(label.style, { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: '0.6', flex: 'none' } as CSSStyleDeclaration);

  const body = document.createElement('span');
  Object.assign(body.style, { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSStyleDeclaration);
  body.textContent = (ad.brand ? ad.brand + ' — ' : '') + ad.text + (ad.body ? '  ' + ad.body : '');

  root.append(label, body);
  if (ad.cta) {
    const cta = document.createElement('span');
    cta.textContent = ad.cta + ' →';
    Object.assign(cta.style, { flex: 'none', fontWeight: '600', color: '#1b50e0', whiteSpace: 'nowrap' } as CSSStyleDeclaration);
    root.append(cta);
  }
  return root;
}

export function mountAd(el: Element, opts: MountOptions): () => void {
  let disposeView: (() => void) | null = null;
  let alive = true;

  const render = (ad: Ad | null) => {
    if (!alive) return;
    if (disposeView) { disposeView(); disposeView = null; }
    el.innerHTML = '';
    if (!ad) return;
    const node = card(ad);
    const onClick = () => openClick(ad);
    node.addEventListener('click', onClick);
    node.addEventListener('keydown', (e) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') onClick(); });
    el.append(node);
    disposeView = observeViewability(node, ad);
  };

  const load = () => fetchAd(opts).then(render);
  load();
  // Rotation floor 30s (faster refreshes are voided as repeat views anyway); skip while the window is hidden.
  const refresh = () => { if (typeof document === 'undefined' || document.visibilityState === 'visible') load(); };
  const id = opts.refreshMs ? setInterval(refresh, Math.max(30_000, opts.refreshMs)) : undefined;

  return () => {
    alive = false;
    if (id) clearInterval(id);
    if (disposeView) disposeView();
    el.innerHTML = '';
  };
}
