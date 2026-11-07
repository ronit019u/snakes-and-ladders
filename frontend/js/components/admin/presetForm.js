// js/components/admin/presetForm.js
// Reads the preset form into the API payload and fills it from a loaded preset.
// Matches the full preset schema: base settings, flashingTile with a weighted
// rewardPool, earthquake, bonus with a weighted rewards pool, and per-item
// enabled/steps config.
import { $ } from '../../utils/dom.js';

const int = (id) => parseInt($(id).value, 10);

export function collectPresetPayload() {
  return {
    displayName: $('p-display-name').value.trim() || $('preset-id-input').value.trim(),
    maxPlayers: int('p-max-players'),
    diceMax: int('p-dice-max'),
    quizTimeout: int('p-quiz-timeout'),
    bonusTimeout: int('p-bonus-timeout'),
    leaderboardDisplayCount: int('p-leaderboard-count'),

    flashingTile: {
      rewardPool: [
        { type: 'rocket', weight: int('p-pool-rocket') || 0 },
        { type: 'bomb', weight: int('p-pool-bomb') || 0 },
        { type: 'arrow', weight: int('p-pool-arrow') || 0 }
      ]
    },

    earthquake: {
      interval: int('p-quake-int'),
      magnitude: int('p-quake-mag')
    },

    bonus: {
      interval: int('p-bonus-int'),
      penaltySteps: int('p-bonus-penalty'),
      rewards: [
        { type: 'item', itemType: 'rocket', weight: int('p-reward-rocket') },
        { type: 'item', itemType: 'bomb', weight: int('p-reward-bomb') },
        { type: 'item', itemType: 'arrow', weight: int('p-reward-arrow') },
        { type: 'forward', steps: int('p-bonus-forward-steps'), weight: int('p-reward-forward') }
      ]
    },

    items: {
      rocket: { enabled: $('p-item-rocket-enabled').checked, steps: int('p-item-rocket-steps') },
      bomb: { enabled: $('p-item-bomb-enabled').checked, steps: int('p-item-bomb-steps') },
      arrow: { enabled: $('p-item-arrow-enabled').checked, steps: int('p-item-arrow-steps') }
    }
  };
}

export function fillPresetForm(p, presetId) {
  const pool = (arr, type) => arr?.find(x => x.type === type)?.weight ?? '';
  const reward = (arr, itemType) => arr?.find(x => x.type === 'item' && x.itemType === itemType)?.weight ?? '';
  const forward = arr => arr?.find(x => x.type === 'forward');

  $('p-display-name').value = p.displayName || presetId;
  $('p-max-players').value = p.maxPlayers ?? 25;
  $('p-dice-max').value = p.diceMax ?? 6;
  $('p-quiz-timeout').value = p.quizTimeout ?? 15;
  $('p-bonus-timeout').value = p.bonusTimeout ?? 15;
  $('p-leaderboard-count').value = p.leaderboardDisplayCount ?? 5;

  // Presets saved before the rewardPool change (including the seeded "default"
  // in db.json) still have the legacy blueEffect.itemPool shape, and
  // loadPreset returns the stored object as-is, so read both.
  const flashPool = p.flashingTile?.rewardPool ?? p.flashingTile?.blueEffect?.itemPool ?? [];
  $('p-pool-rocket').value = pool(flashPool, 'rocket');
  $('p-pool-bomb').value = pool(flashPool, 'bomb');
  $('p-pool-arrow').value = pool(flashPool, 'arrow');

  $('p-quake-mag').value = p.earthquake.magnitude;
  $('p-quake-int').value = p.earthquake.interval || 60;

  $('p-bonus-int').value = p.bonus.interval;
  $('p-bonus-penalty').value = p.bonus.penaltySteps ?? 2;
  $('p-reward-rocket').value = reward(p.bonus.rewards, 'rocket');
  $('p-reward-bomb').value = reward(p.bonus.rewards, 'bomb');
  $('p-reward-arrow').value = reward(p.bonus.rewards, 'arrow');
  const fwd = forward(p.bonus.rewards);
  $('p-reward-forward').value = fwd?.weight ?? '';
  $('p-bonus-forward-steps').value = fwd?.steps ?? 3;

  $('p-item-rocket-enabled').checked = p.items?.rocket?.enabled !== false;
  $('p-item-rocket-steps').value = p.items?.rocket?.steps ?? 5;
  $('p-item-bomb-enabled').checked = p.items?.bomb?.enabled !== false;
  $('p-item-bomb-steps').value = p.items?.bomb?.steps ?? 5;
  $('p-item-arrow-enabled').checked = p.items?.arrow?.enabled !== false;
  $('p-item-arrow-steps').value = p.items?.arrow?.steps ?? 3;
}
