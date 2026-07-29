// services/gameLogic.js

// ---------- 蛇梯位置 ----------
const LADDERS = [
  [2, 23], [6, 45], [20, 59], [52, 71],
  [57, 96], [71, 92], [88, 99], [95, 98]
];

const SNAKES = [
  [16, 6], [47, 26], [49, 11], [56, 53],
  [62, 19], [64, 60], [87, 24], [93, 73]
];

// ---------- 闪光格位置（硬编码） ----------
const FLASHING_TILES = [5, 12, 28, 35, 42, 58, 65, 72, 88, 95];


// ---------- 默认预设 ----------
const DEFAULT_PRESET = {
  presetId: 'default',
  displayName: 'Default',
  flashingTile: {
    blueProb: 0.3,
    redProb: 0.3,
    blueEffect: {
      type: 'item',
      itemTypes: ['rocket', 'bomb'],
      itemProb: 0.5
    },
    redEffect: {
      type: 'penalty',
      penaltySteps: 2
    }
  },
  earthquake: {
    magnitude: 3,
    interval: 60
  },
  bonus: {
    interval: 180,
    forwardSteps: 5
  },
  items: {
    rocket: { enabled: true, steps: 3 },
    bomb: { enabled: true, steps: 3 }
  }
};


// ---------- 获取预设（带默认值合并） ----------
function getPreset(preset) {
  if (!preset) return JSON.parse(JSON.stringify(DEFAULT_PRESET));

  return {
    presetId: preset.presetId || 'custom',
    displayName: preset.displayName || 'Custom',
    flashingTile: {
      blueProb: preset.flashingTile?.blueProb ?? DEFAULT_PRESET.flashingTile.blueProb,
      redProb: preset.flashingTile?.redProb ?? DEFAULT_PRESET.flashingTile.redProb,
      blueEffect: {
        type: preset.flashingTile?.blueEffect?.type ?? DEFAULT_PRESET.flashingTile.blueEffect.type,
        itemTypes: preset.flashingTile?.blueEffect?.itemTypes ?? DEFAULT_PRESET.flashingTile.blueEffect.itemTypes,
        itemProb: preset.flashingTile?.blueEffect?.itemProb ?? DEFAULT_PRESET.flashingTile.blueEffect.itemProb
      },
      redEffect: {
        type: preset.flashingTile?.redEffect?.type ?? DEFAULT_PRESET.flashingTile.redEffect.type,
        penaltySteps: preset.flashingTile?.redEffect?.penaltySteps ?? DEFAULT_PRESET.flashingTile.redEffect.penaltySteps
      }
    },
    earthquake: {
      magnitude: preset.earthquake?.magnitude ?? DEFAULT_PRESET.earthquake.magnitude,
      frequency: preset.earthquake?.frequency ?? DEFAULT_PRESET.earthquake.frequency
    },
    bonus: {
      interval: preset.bonus?.interval ?? DEFAULT_PRESET.bonus.interval,
      forwardSteps: preset.bonus?.forwardSteps ?? DEFAULT_PRESET.bonus.forwardSteps
    },
    items: {
      rocket: {
        enabled: preset.items?.rocket?.enabled ?? DEFAULT_PRESET.items.rocket.enabled,
        steps: preset.items?.rocket?.steps ?? DEFAULT_PRESET.items.rocket.steps
      },
      bomb: {
        enabled: preset.items?.bomb?.enabled ?? DEFAULT_PRESET.items.bomb.enabled,
        steps: preset.items?.bomb?.steps ?? DEFAULT_PRESET.items.bomb.steps
      }
    }
  };
}


// ---------- 道具系统 ----------
function getItemSteps(itemType, preset) {
  const config = getPreset(preset);
  const itemConfig = config.items[itemType];
  if (!itemConfig || !itemConfig.enabled) return null;
  return itemConfig.steps;
}


// ---------- 奖励系统 ----------
function getBonusSteps(preset) {
  return getPreset(preset).bonus.forwardSteps;
}


// ---------- 骰子系统 ----------
function generateDiceValue() {
  return Math.floor(Math.random() * 6) + 1;
}

function calculateLandingTile(currentTile, diceValue) {
  return currentTile + diceValue;
}


// ---------- 格子类型 ----------
function getTileType(tile) {
  if (LADDERS.some(l => l[0] === tile)) return 'ladder';
  if (SNAKES.some(s => s[0] === tile)) return 'snake';
  return 'blank';
}


// ---------- 闪光格 ----------
function isFlashingTile(tile) {
  return FLASHING_TILES.includes(tile);
}

// 从预设读取闪光格效果
function getFlashingTileEffect(tile, preset) {
  const config = getPreset(preset);
  const rand = Math.random();
  const { blueProb, redProb, blueEffect, redEffect } = config.flashingTile;

  if (rand < blueProb) {
    // 蓝色闪光：可能获得道具
    const hasItem = Math.random() < blueEffect.itemProb;
    if (hasItem) {
      // 只返回预设中启用的道具
      const availableItems = blueEffect.itemTypes.filter(type => {
        const itemConfig = config.items[type];
        return itemConfig && itemConfig.enabled;
      });
      if (availableItems.length > 0) {
        const selected = availableItems[Math.floor(Math.random() * availableItems.length)];
        return { type: 'item', item: selected };
      }
    }
    return { type: 'nothing' };
  } else if (rand < blueProb + redProb) {
    // 红色闪光：惩罚
    return { type: 'penalty', steps: redEffect.penaltySteps };
  }

  return { type: 'nothing' };
}


// ---------- 导出 ----------
module.exports = {
  // 数据
  LADDERS,
  SNAKES,
  FLASHING_TILES,
  DEFAULT_PRESET,

  // 预设系统
  getPreset,
  getItemSteps,
  getBonusSteps,

  // 骰子/移动
  generateDiceValue,
  calculateLandingTile,
  getTileType,

  // 闪光格
  isFlashingTile,
  getFlashingTileEffect
};