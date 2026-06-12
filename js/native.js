'use strict';

// Thin bridge to native capabilities when running inside the Capacitor
// iOS shell. Every call is a safe no-op in a plain browser, so the same
// code ships to web, PWA, and App Store builds.
const Native = {
  get isNative() {
    return !!(window.Capacitor &&
              window.Capacitor.isNativePlatform &&
              window.Capacitor.isNativePlatform());
  },

  _plugin(name) {
    const cap = window.Capacitor;
    return cap && cap.Plugins ? cap.Plugins[name] : null;
  },

  // kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'
  haptic(kind = 'light') {
    const h = this._plugin('Haptics');
    if (h) {
      try {
        if (kind === 'success' || kind === 'warning' || kind === 'error') {
          h.notification({ type: kind.toUpperCase() });
        } else {
          h.impact({ style: kind.toUpperCase() });
        }
      } catch {}
      return;
    }
    // Android browsers support vibrate(); iOS Safari ignores it
    if (navigator.vibrate) {
      try { navigator.vibrate(kind === 'heavy' ? 25 : 10); } catch {}
    }
  },

  // Durable key-value storage (survives WebView data eviction on iOS).
  // localStorage stays the synchronous source of truth; these mirror it.
  async kvSet(key, value) {
    const p = this._plugin('Preferences');
    if (p) { try { await p.set({ key, value }); } catch {} }
  },

  async kvGet(key) {
    const p = this._plugin('Preferences');
    if (p) {
      try { return (await p.get({ key })).value; } catch {}
    }
    return null;
  },

  async kvRemove(key) {
    const p = this._plugin('Preferences');
    if (p) { try { await p.remove({ key }); } catch {} }
  },
};
