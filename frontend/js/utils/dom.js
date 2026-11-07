// js/utils/dom.js
// Small DOM helpers shared by the player and admin pages.

export const $ = (id) => document.getElementById(id);

export function showMsg(elId, text, ok) {
  $(elId).innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}">${text}</div>`;
}

// Wraps a click handler: disables the button, swaps its label while the
// async work runs, and reports unexpected errors into `errorElId`.
export function withLoadingState(buttonEl, loadingText, fn, errorElId) {
  return async (...args) => {
    if (buttonEl.disabled) return;
    const original = buttonEl.innerText;
    buttonEl.disabled = true;
    buttonEl.innerText = loadingText;
    try {
      await fn(...args);
    } catch (err) {
      console.error('[ui] unexpected error:', err);
      showMsg(errorElId, `Unexpected error: ${err.message}`, false);
    } finally {
      buttonEl.disabled = false;
      buttonEl.innerText = original;
    }
  };
}
