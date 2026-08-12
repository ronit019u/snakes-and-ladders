// services/gameLogic.js

// ---------- Ladders and Snakes positions ----------
const LADDERS = [
  [2, 23], [6, 45], [20, 59], [52, 71],
  [57, 96], [71, 92], [88, 99], [95, 98]
];

const SNAKES = [
  [16, 6], [47, 26], [49, 11], [56, 53],
  [62, 19], [64, 60], [87, 24], [93, 73]
];

// ---------- Flashing tiles (hardcoded positions) ----------
const FLASHING_TILES = [5, 12, 28, 35, 42, 58, 65, 72, 88, 95];



function calculateTargetTile(landingTile, isCorrect) {
  // Check for ladder
  const ladder = LADDERS.find(l => l[0] === landingTile);
  if (ladder) {
    // Correct: climb to the top; incorrect: stay put
    return isCorrect ? ladder[1] : landingTile;
  }

  // Check for snake
  const snake = SNAKES.find(s => s[0] === landingTile);
  if (snake) {
    if (isCorrect) {
      return Math.min(100, landingTile + 1);
    } else {
      // Incorrect: slide down to tail only
      return snake[1];
    }
  }

  // Blank tile: no change
  return landingTile;
}

// ---------- Default preset ----------
const DEFAULT_PRESET = {
  presetId: 'default',
  displayName: 'Default',
  
  maxPlayers: 25,
  diceMax: 6,
  quizTimeout: 15,
  bonusTimeout: 15,
  leaderboardDisplayCount: 5,
  
  flashingTile: {
    blueProb: 30,
    redProb: 30,
    blueEffect: {
      type: 'item',
      itemProb: 50,
      itemPool: [
        { type: 'rocket', weight: 5 },
        { type: 'bomb', weight: 3 },
        { type: 'arrow', weight: 2 }
      ]
    },
    redEffect: {
      type: 'penalty',
      penaltySteps: 2
    }
  },
  
  earthquake: {
    interval: 60,
    magnitude: 3
  },
  
  bonus: {
    interval: 180,
    rewards: [
      { type: 'item', itemType: 'rocket', weight: 4 },
      { type: 'item', itemType: 'bomb', weight: 2 },
      { type: 'item', itemType: 'arrow', weight: 2 },
      { type: 'forward', steps: 3, weight: 2 }
    ],
    penaltySteps: 2
  },
  
  items: {
    rocket: { enabled: true, steps: 5 },
    bomb: { enabled: true, steps: 5 },
    arrow: { enabled: true, steps: 3 }
  }
};

// ---------- Get preset with default fallback ----------
function getPreset(preset) {
  if (!preset) return JSON.parse(JSON.stringify(DEFAULT_PRESET));
  
  return {
    presetId: preset.presetId || 'custom',
    displayName: preset.displayName || 'Custom',
    
    maxPlayers: preset.maxPlayers ?? DEFAULT_PRESET.maxPlayers,
    diceMax: preset.diceMax ?? DEFAULT_PRESET.diceMax,
    quizTimeout: preset.quizTimeout ?? DEFAULT_PRESET.quizTimeout,
    bonusTimeout: preset.bonusTimeout ?? DEFAULT_PRESET.bonusTimeout,
    leaderboardDisplayCount: preset.leaderboardDisplayCount ?? DEFAULT_PRESET.leaderboardDisplayCount,
    
    flashingTile: {
      blueProb: preset.flashingTile?.blueProb ?? DEFAULT_PRESET.flashingTile.blueProb,
      redProb: preset.flashingTile?.redProb ?? DEFAULT_PRESET.flashingTile.redProb,
      blueEffect: {
        type: preset.flashingTile?.blueEffect?.type ?? DEFAULT_PRESET.flashingTile.blueEffect.type,
        itemProb: preset.flashingTile?.blueEffect?.itemProb ?? DEFAULT_PRESET.flashingTile.blueEffect.itemProb,
        itemPool: preset.flashingTile?.blueEffect?.itemPool ?? DEFAULT_PRESET.flashingTile.blueEffect.itemPool
      },
      redEffect: {
        type: preset.flashingTile?.redEffect?.type ?? DEFAULT_PRESET.flashingTile.redEffect.type,
        penaltySteps: preset.flashingTile?.redEffect?.penaltySteps ?? DEFAULT_PRESET.flashingTile.redEffect.penaltySteps
      }
    },
    
    earthquake: {
      interval: preset.earthquake?.interval ?? DEFAULT_PRESET.earthquake.interval,
      magnitude: preset.earthquake?.magnitude ?? DEFAULT_PRESET.earthquake.magnitude
    },
    
    bonus: {
      interval: preset.bonus?.interval ?? DEFAULT_PRESET.bonus.interval,
      rewards: preset.bonus?.rewards ?? DEFAULT_PRESET.bonus.rewards,
      penaltySteps: preset.bonus?.penaltySteps ?? DEFAULT_PRESET.bonus.penaltySteps
    },
    
    items: {
      rocket: {
        enabled: preset.items?.rocket?.enabled ?? DEFAULT_PRESET.items.rocket.enabled,
        steps: preset.items?.rocket?.steps ?? DEFAULT_PRESET.items.rocket.steps
      },
      bomb: {
        enabled: preset.items?.bomb?.enabled ?? DEFAULT_PRESET.items.bomb.enabled,
        steps: preset.items?.bomb?.steps ?? DEFAULT_PRESET.items.bomb.steps
      },
      arrow: {
        enabled: preset.items?.arrow?.enabled ?? DEFAULT_PRESET.items.arrow.enabled,
        steps: preset.items?.arrow?.steps ?? DEFAULT_PRESET.items.arrow.steps
      }
    }
  };
}

// gameLogic.js

function pickByWeight(pool) {
  if (!pool || pool.length === 0) return null;
  const total = pool.reduce((sum, item) => sum + (item.weight || 0), 0);
  if (total === 0) return pool[0];
  let rand = Math.random() * total;
  for (const item of pool) {
    rand -= (item.weight || 0);
    if (rand <= 0) return item;
  }
  return pool[pool.length - 1];
}


// ---------- Item system ----------
function getItemSteps(itemType, preset) {
  const config = getPreset(preset);
  const itemConfig = config.items[itemType];
  if (!itemConfig || !itemConfig.enabled) return null;
  return itemConfig.steps;
}


// ---------- Bonus system ----------
function getBonusSteps(preset) {
  return getPreset(preset).bonus.forwardSteps;
}


// ---------- Dice system ----------
function generateDiceValue() {
  return Math.floor(Math.random() * 6) + 1;
}

function calculateLandingTile(currentTile, diceValue) {
  return currentTile + diceValue;
}


// ---------- Tile type detection ----------
function getTileType(tile) {
  if (LADDERS.some(l => l[0] === tile)) return 'ladder';
  if (SNAKES.some(s => s[0] === tile)) return 'snake';
  return 'blank';
}


// ---------- Flashing tile effects ----------
function isFlashingTile(tile) {
  return FLASHING_TILES.includes(tile);
}

// Get flashing tile effect from preset
function getFlashingTileEffect(tile, preset) {
  const config = getPreset(preset);
  const rand = Math.random() * 100;
  const { blueProb, redProb, blueEffect, redEffect } = config.flashingTile;

  if (rand < blueProb) {
    // 蓝格：是否给道具
    const hasItem = Math.random() * 100 < blueEffect.itemProb;
    if (hasItem) {
      // 从 itemPool 按权重抽取
      const pool = blueEffect.itemPool || [];
      // 过滤掉未启用的道具
      const availablePool = pool.filter(item => {
        const itemConfig = config.items[item.type];
        return itemConfig && itemConfig.enabled;
      });
      if (availablePool.length > 0) {
        const selected = pickByWeight(availablePool);
        if (selected) return { type: 'item', item: selected.type };
      }
    }
    return { type: 'nothing' };
  } else if (rand < blueProb + redProb) {
    // 红格：惩罚
    return { type: 'penalty', steps: redEffect.penaltySteps };
  }
  return { type: 'nothing' };
}
// ---------- Bonus reward system ----------
function getBonusReward(preset) {
  const config = getPreset(preset);
  const rewards = config.bonus.rewards || [];
  
  // 过滤出有效的奖励（如果是道具，检查是否启用）
  const availableRewards = rewards.filter(r => {
    if (r.type === 'item') {
      const itemConfig = config.items[r.itemType];
      return itemConfig && itemConfig.enabled;
    }
    return true; // forward 类型始终有效
  });
  
  if (availableRewards.length === 0) {
    // 兜底：给个默认前进
    return { type: 'forward', steps: 3 };
  }
  
  const selected = pickByWeight(availableRewards);
  if (selected.type === 'item') {
    return { type: 'item_grant', value: selected.itemType };
  } else if (selected.type === 'forward') {
    return { type: 'forward_boost', value: selected.steps || 3 };
  }
  
  // 兜底
  return { type: 'forward_boost', value: 3 };
}


// ---------- Exports ----------
module.exports = {
  // Data
  LADDERS,
  SNAKES,
  FLASHING_TILES,
  DEFAULT_PRESET,

  // Preset system
  getPreset,
  getItemSteps,
  getBonusSteps,

  // Dice / movement
  generateDiceValue,
  calculateLandingTile,
  getTileType,
  calculateTargetTile,

  // Flashing tiles
  isFlashingTile,
  getFlashingTileEffect,
  getBonusReward
};