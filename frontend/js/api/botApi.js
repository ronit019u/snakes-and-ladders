// js/api/botApi.js  (used only by js/services/botManager.js)
//
// Real players never send their own playerId on move/item/quiz calls — the
// backend figures out "who is calling" from the express-session cookie, since
// each real player has their own browser and therefore their own cookie jar.
// That trick breaks down for 25 bots living inside one admin tab: they all
// share the SAME cookie jar, so every join/roll would silently stomp on
// whichever bot's cookie landed last, and could also hijack the admin's own
// session.
//
// To avoid that, bot requests carry sessionId/playerId explicitly in the body
// and go out with credentials 'omit' (no cookies sent at all). The backend
// resolves "current player" from req.body.playerId when there's no session
// cookie, the same way GameAPI.disconnect(sessionId, playerId) does.
import { apiGet, apiPost } from './http.js';

export const BotAPI = {
  join: (sessionId, username) => apiPost('/api/game/join', { sessionId, username }, false, 'omit'),
  rollDice: (sessionId, playerId, questionId, selectedOption) => apiPost(
    '/api/game/move',
    questionId && selectedOption
      ? { sessionId, playerId, questionId, selectedOption }
      : { sessionId, playerId },
    false, 'omit'
  ),
  finalizeMove: (sessionId, playerId, targetTile) => apiPost('/api/game/move', { sessionId, playerId, targetTile }, false, 'omit'),
  useItem: (sessionId, playerId, itemType, targetPlayerId) => apiPost('/api/game/item/use', { sessionId, playerId, itemType, targetPlayerId }, false, 'omit'),
  getRandomQuestion: (sessionId) => apiGet(`/api/question/random/${sessionId}`, 'omit'),
  validateAnswer: (sessionId, playerId, questionId, selectedOption) => apiPost('/api/question/validate', { sessionId, playerId, questionId, selectedOption }, false, 'omit'),
  submitBonusAnswer: (sessionId, playerId, bonusRoundId, selectedOption) => apiPost('/api/bonus/answer', { sessionId, playerId, bonusRoundId, selectedOption }, false, 'omit')
};
