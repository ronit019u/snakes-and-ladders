// js/config.js
// Single source of truth for the backend URL. Both player.html and admin.html import this.

export const state = {
  apiBase: 'http://localhost:5000'
};

export function setApiBase(url) {
  state.apiBase = url.replace(/\/$/, '');
}
