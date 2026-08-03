// js/config.js
// Single source of truth for the backend URL. Both player.html and admin.html import this.
//
// Defaults to the page's own origin. When the backend serves this frontend
// directly (see server.js's express.static setup), that's automatically
// correct with zero configuration - no separate dev server, no manually
// typing a URL, no cross-origin cookie issues.

export const state = {
  apiBase: (typeof window !== 'undefined' && window.location.origin.startsWith('http'))
    ? window.location.origin
    : 'http://localhost:5000'
};

export function setApiBase(url) {
  state.apiBase = url.replace(/\/$/, '');
}
