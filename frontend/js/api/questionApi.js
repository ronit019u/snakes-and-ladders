// js/api/questionApi.js  (mirrors backend routes/questionRoutes.js)
import { apiGet, apiPost } from './http.js';

export const QuestionAPI = {
  getRandom: (sessionId) => apiGet(`/api/question/random/${sessionId}`),
  validate: (questionId, selectedOption) => apiPost('/api/question/validate', { questionId, selectedOption })
};
