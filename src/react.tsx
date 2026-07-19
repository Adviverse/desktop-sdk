/**
 * <AdviverseAd/> — drop-in React ad card for Electron/Tauri renderers.
 *
 *   import { AdviverseAd } from '@adviverse/desktop/react';
 *   <AdviverseAd token="ts_yourtoken" />
 *
 * Fetches an ad, renders a disclosed card, fires the impression on true
 * viewability, and opens clicks in the default browser. Renders nothing on
 * no-fill. Styling is minimal + theme-aware; pass `className`/`style` to skin it.
 */
import { useEffect, useRef, useState } from 'react';
import { Ad, AdviverseConfig, fetchAd, observeViewability, openClick } from './core';

export interface AdviverseAdProps extends AdviverseConfig {
  /** Re-fetch on an interval (ms). Omit for a single fetch on mount. */
  refreshMs?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Render your own card instead of the built-in one. */
  children?: (ad: Ad, onClick: () => void) => React.ReactNode;
}

export function AdviverseAd(props: AdviverseAdProps): JSX.Element | null {
  const { refreshMs, className, style, children, ...cfg } = props;
  const [ad, setAd] = useState<Ad | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => { fetchAd(cfg).then((a) => { if (alive) setAd(a); }); };
    load();
    const id = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => { alive = false; if (id) clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.token, refreshMs]);

  useEffect(() => {
    if (!ad || !ref.current) return;
    return observeViewability(ref.current, ad);
  }, [ad]);

  if (!ad) return null;
  const onClick = () => openClick(ad);

  if (children) {
    return <div ref={ref} className={className} style={style}>{children(ad, onClick)}</div>;
  }

  return (
    <div
      ref={ref}
      className={className}
      onClick={onClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        padding: '10px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.35,
        border: '1px solid rgba(127,127,127,0.22)', background: 'rgba(127,127,127,0.06)',
        color: 'inherit', maxWidth: '100%', boxSizing: 'border-box', ...style,
      }}
    >
      <span style={{
        fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
        opacity: 0.6, flex: 'none',
      }}>{ad.label || 'ad'}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ad.brand ? <b>{ad.brand}</b> : null}{ad.brand ? ' — ' : ''}{ad.text}
        {ad.body ? <span style={{ opacity: 0.7 }}>{'  ' + ad.body}</span> : null}
      </span>
      {ad.cta ? (
        <span style={{
          flex: 'none', fontWeight: 600, color: '#1b50e0',
          whiteSpace: 'nowrap',
        }}>{ad.cta} →</span>
      ) : null}
    </div>
  );
}
