// js/api/adminApi.js  (mirrors backend routes/adminRoutes.js)
import { apiGet, apiPost } from './http.js';

export const AdminAPI = {
  login: (username, password) => apiPost('/api/admin/login', { username, password }),
  createRoom: (username, presetId) => apiPost('/api/admin/create', { username, presetId }),
  uploadQuestions: (formData) => apiPost('/api/admin/questions/upload', formData, true),
  savePreset: (presetId, presets, sessionId) => apiPost('/api/admin/presets', { presetId, presets, sessionId }),
  loadPreset: (presetId) => apiPost('/api/admin/presets', { presetId }),
  // GET /api/admin/presets -> { code: 0, data: { presets: [{ presetId, displayName }, ...] } }
  listPresets: () => apiGet('/api/admin/presets')
};
