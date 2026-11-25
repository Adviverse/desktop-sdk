# @adviverse/desktop

Adviverse ads for **native desktop apps that host a webview** — Electron, Tauri,
CEF, WKWebView, WebView2. It runs the same loop as the terminal/mobile SDKs:
**fetch → cache → render → viewability → impression → click**, with the ad
rendered right in your app's UI. On no-fill it renders nothing.

For a **pure-native** app (Qt/Cocoa/WinUI, no webview), use the native-render
core instead: [`@adviverse/desktop-native`](../desktop-native) (C ABI).

## Install

```sh
npm install @adviverse/desktop
```

| You use | Package | Repo |
|---|---|---|
| Any webview, no framework (Tauri, CEF, WKWebView, WebView2, Electron renderer) | `@adviverse/desktop` | [desktop-sdk](https://github.com/Adviverse/desktop-sdk) |
| React renderer | `@adviverse/desktop-react` | [desktop-react-sdk](https://github.com/Adviverse/desktop-react-sdk) |
| Electron main process (click → system browser) | `@adviverse/electron` | [electron-sdk](https://github.com/Adviverse/electron-sdk) |

Get a **serve token** (`ts_…`) from your Adviverse dashboard (Publisher →
Placements → terminal/SDK token). `ak_…` API keys and publisher placement tags
also work.

## Renderer — no framework

```ts
import { mountAd } from '@adviverse/desktop';

const dispose = mountAd(document.getElementById('ad')!, {
  token: 'ts_yourtoken',
  refreshMs: 60000,
});
// later: dispose();
```

Or drive it yourself:

```ts
import { fetchAd, openClick, observeViewability } from '@adviverse/desktop';

const ad = await fetchAd({ token: 'ts_yourtoken' });
if (ad) {
  const el = renderYourCard(ad);            // your DOM
  observeViewability(el, ad);               // fires the impression when truly visible
  el.onclick = () => openClick(ad);         // opens the landing page in the default browser
}
```

## Opening clicks in the system browser

A display-ad click must open the **default browser**, not navigate your app
window. `openClick()` auto-detects the host:

- **Tauri** — uses the shell-open plugin (add `@tauri-apps/plugin-shell` and
  allow `shell:open`).
- **Electron** — expose a bridge from the main process (below).
- **Fallback** — `window.open(url, '_blank')`.

### Electron bridge

Electron apps install [`@adviverse/electron`](https://github.com/Adviverse/electron-sdk)
in the main process (one call + a ready-made preload).

## What "done right" means (built in)

- **Viewability** — the impression fires only when the ad is ≥50% on-screen
  **and** the window is visible **and** focused, continuously for ~1s (MRC-style).
  Backgrounded/minimized windows don't count.
- **Consent** — pass `consent: { gdpr, usPrivacy }` (TCF string / US-Privacy);
  they're forwarded to serving.
- **Integrity** — a stable per-install `uid` is generated + persisted; ships
  your serve token. For signed placements use an `ak_` key server-side.
- **Frequency/caching** — the ad is cached ~60s per token, so a re-render or a
  tight `refreshMs` never hammers the network.

## Config

| field | default | notes |
|-------|---------|-------|
| `token` | — | `ts_` serve token \| `ak_` API key \| publisher tag (required) |
| `uid` | auto | stable per-install id (persisted in localStorage) |
| `consent` | — | `{ gdpr, usPrivacy }` privacy signals |
| `emailSha256` | — | SHA-256 of a lowercased email (opt-in identity) |
| `client` | `"desktop"` | reporting/integrity label |
| `base` | `https://serve.adviverse.com` | serve host override |
| `timeoutMs` | `2500` | fetch timeout (UI never blocks regardless) |

## Store policies

Mac App Store / Microsoft Store require ads to be **disclosed** and non-deceptive
— the built-in card shows an `ad` label; keep it if you swap in custom markup.
Steam / self-distributed apps are more permissive.
