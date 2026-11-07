// js/api/index.js
// One import point for every backend call: import { GameAPI, AdminAPI } from '../../api/index.js'
export { apiGet, apiPost } from './http.js';
export { GameAPI } from './gameApi.js';
export { QuestionAPI } from './questionApi.js';
export { BonusAPI } from './bonusApi.js';
export { AdminAPI } from './adminApi.js';
export { BotAPI } from './botApi.js';
