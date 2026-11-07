// js/components/admin/presetPanel.js
// Save / load presets and keep the room-creation dropdown in sync with
// the real preset list from the backend.
import { $, showMsg } from '../../utils/dom.js';
import { AdminAPI } from '../../api/index.js';
import { adminState } from '../../state/adminState.js';
import { collectPresetPayload, fillPresetForm } from './presetForm.js';

function populatePresetSelect(presets, selectId) {
  const select = $('preset-select');
  const previousValue = select.value;
  select.innerHTML = '';
  (presets || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.presetId;
    opt.innerText = p.displayName || p.presetId;
    select.appendChild(opt);
  });
  const wanted = selectId || previousValue;
  if (wanted && [...select.options].some(o => o.value === wanted)) {
    select.value = wanted;
  }
}

export async function refreshPresetDropdown(selectId) {
  const r = await AdminAPI.listPresets();
  if (r.code !== 0) {
    console.warn('[admin] failed to load preset list:', r.msg);
    return;
  }
  populatePresetSelect(r.data.presets, selectId);
}

export async function handleSavePreset() {
  const presetId = $('preset-id-input').value.trim();
  if (!presetId) return showMsg('preset-msg', 'Enter a preset ID first', false);
  const r = await AdminAPI.savePreset(presetId, collectPresetPayload(), adminState.sessionId || undefined);
  showMsg('preset-msg', r.msg, r.code === 0);
  if (r.code === 0) await refreshPresetDropdown(presetId);
}

export async function handleLoadPreset() {
  const presetId = $('preset-id-input').value.trim();
  if (!presetId) return showMsg('preset-msg', 'Enter a preset ID first', false);
  const r = await AdminAPI.loadPreset(presetId);
  if (r.code !== 0) return showMsg('preset-msg', r.msg, false);

  fillPresetForm(r.data.presets, presetId);
  showMsg('preset-msg', `Loaded preset '${presetId}'`, true);
  await refreshPresetDropdown(presetId);
}
