// js/api/gameApi.js  (mirrors backend routes/gameRoutes.js)
import { apiGet, apiPost } from './http.js';

export const GameAPI = {
  create: (username) => apiPost('/api/game/create', { username }),
  join: (sessionId, username) => apiPost('/api/game/join', { sessionId, username }),
  getState: (sessionId) => apiGet(`/api/game/state/${sessionId}`),
  setCharacter: (characterId) => apiPost('/api/game/character', { characterId }),
  start: () => apiPost('/api/game/start'),
  // Pre-roll quiz flow (POST /api/game/move):
  //   rollDice()                           -> asks for a pre-roll question (data.prerollQuiz) or, if the
  //                                           question pool is exhausted, rolls straight away (data.diceValue)
  //   rollDice(questionId, selectedOption) -> correct: rolls (data.diceValue);
  //                                           wrong: { correct:false, prerollQuiz: <new question> }
  rollDice: (questionId, selectedOption) =>
    apiPost('/api/game/move', questionId && selectedOption ? { questionId, selectedOption } : {}),
  finalizeMove: (targetTile) => apiPost('/api/game/move', { targetTile }),
  useItem: (itemType, targetPlayerId) => apiPost('/api/game/item/use', { itemType, targetPlayerId }),
  disconnect: (sessionId, playerId) => apiPost('/api/game/player/disconnect', { sessionId, playerId })
};
