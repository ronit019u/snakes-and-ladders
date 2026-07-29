// services/dbService.js
const fs = require('fs');
const path = require('path');

// db.json 的路径（项目根目录）
const DB_PATH = path.join(__dirname, '../db.json');

// 默认数据结构（第一次运行时自动创建）
const defaultDB = {
  sessions: {},
  questions: [
    // 预置 10 道题，方便直接测试
    { questionId: 'Q001', questionText: 'What does HTTP stand for?', options: ['Hyper Text Transfer Protocol', 'High Tech Transfer Protocol', 'Hyper Transfer Text Protocol', 'None of the above'], correctAnswer: 'A' },
    { questionId: 'Q002', questionText: 'What is the default port for HTTPS?', options: ['80', '443', '8080', '22'], correctAnswer: 'B' },
    { questionId: 'Q003', questionText: 'Which of these is a NoSQL database?', options: ['MySQL', 'PostgreSQL', 'MongoDB', 'Oracle'], correctAnswer: 'C' },
    { questionId: 'Q004', questionText: 'What does CSS stand for?', options: ['Cascading Style Sheets', 'Creative Style Sheets', 'Computer Style Sheets', 'Colorful Style Sheets'], correctAnswer: 'A' },
    { questionId: 'Q005', questionText: 'Which HTML tag is used to create a hyperlink?', options: ['<link>', '<a>', '<href>', '<url>'], correctAnswer: 'B' },
    { questionId: 'Q006', questionText: 'What is the correct way to declare a variable in JavaScript?', options: ['var x = 5;', 'variable x = 5;', 'v x = 5;', 'let x: 5;'], correctAnswer: 'A' },
    { questionId: 'Q007', questionText: 'Which protocol is used to send email?', options: ['HTTP', 'FTP', 'SMTP', 'SSH'], correctAnswer: 'C' },
    { questionId: 'Q008', questionText: 'What is the file extension for a Java source file?', options: ['.java', '.class', '.jav', '.js'], correctAnswer: 'A' },
    { questionId: 'Q009', questionText: 'What is the output of 2 + "2" in JavaScript?', options: ['4', '"4"', '"22"', 'Error'], correctAnswer: 'C' },
    { questionId: 'Q010', questionText: 'Which company developed Node.js?', options: ['Google', 'Facebook', 'Microsoft', 'Joyent'], correctAnswer: 'D' }
  ],
  "presetsLibrary": {
    "default": {
      "presetId": "default",
      "displayName": "Default",
      "flashingTile": {
        "blueProb": 0.3,
        "redProb": 0.3,
        "blueEffect": {
          "type": "item",
          "itemTypes": ["rocket", "bomb"],
          "itemProb": 0.5
        },
        "redEffect": {
          "type": "penalty",
          "penaltySteps": 2
        }
      },
      "earthquake": {
        "magnitude": 3,
        "interval": 60,
      },
      "bonus": {
        "interval": 180,
        "forwardSteps": 5
      },
      "items": {
        "rocket": { "enabled": true, "steps": 3 },
        "bomb": { "enabled": true, "steps": 3 }
      }
    }
  }
};

// ---------- 核心读写 ----------

// 读数据库（从 db.json 读取，如果文件不存在则初始化）
function readDB() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    // 文件不存在或损坏 → 用默认数据初始化
    writeDB(defaultDB);
    return defaultDB;
  }
}

// 写数据库（把数据存回 db.json）
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ---------- 工具函数 ----------

// 生成短 ID（用于 sessionId, playerId 等）
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// 根据 sessionId 查找会话
function findSession(sessionId) {
  const db = readDB();
  return db.sessions[sessionId] || null;
}

// 根据 sessionId 和 playerId 查找玩家
function findPlayer(sessionId, playerId) {
  const session = findSession(sessionId);
  if (!session) return null;
  return session.players.find(p => p.playerId === playerId) || null;
}

// ---------- 导出 ----------
module.exports = {
  readDB,
  writeDB,
  generateId,
  findSession,
  findPlayer
};