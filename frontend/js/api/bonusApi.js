// js/api/bonusApi.js  (mirrors backend routes/bonusRoutes.js)
import { apiPost } from './http.js';

export const BonusAPI = {
  submitAnswer: (bonusRoundId, selectedOption) => apiPost('/api/bonus/answer', { bonusRoundId, selectedOption })
};
