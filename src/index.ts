/**
 * @adviverse/desktop — ads for native desktop apps that host a webview
 * (Electron, Tauri, CEF, WKWebView, WebView2).
 *
 * Renderer entry (no React): core loop + a framework-free mount.
 *   import { mountAd, fetchAd } from '@adviverse/desktop';
 * React:            import { AdviverseAd } from '@adviverse/desktop/react';
 * Electron main:    import { registerAdviverse } from '@adviverse/desktop/electron';
 */
export type { Ad, AdviverseConfig } from './core';
export { fetchAd, openClick, fireImpression, observeViewability } from './core';
export { mountAd } from './vanilla';
export type { MountOptions } from './vanilla';
