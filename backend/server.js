const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const gameRoutes = require('./routes/gameRoutes');
const errorHandler = require('./middleware/errorHandler');
const questionRoutes = require('./routes/questionRoutes');
//const FileStore = require('./services/sessionStore');
const bonusRoutes = require('./routes/bonusRoutes');
const socketService = require('./services/socketService');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: true, credentials: true }
});

// ---------- 中间件（请求的“安检门”）----------
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());              // 让 req.body 能读到 JSON
app.use(cookieParser());              // 让 req.cookies 能读到 Cookie
app.use(session({
  secret: 'demo-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',   // 允许本地跨域请求携带 Cookie
    secure: false      // localhost 不需要 HTTPS，必须是 false
  }
}));

// ---------- 路由 ----------
app.use('/api/game', gameRoutes);
app.use('/api/question', questionRoutes);
app.use('/api/bonus', bonusRoutes);
app.use('/api/admin', adminRoutes);

// 放在所有路由之后、errorHandler 之前
app.use((req, res) => {
  res.status(404).json({
    code: 404,
    data: null,
    msg: `Route ${req.method} ${req.path} not found`
  });
});

app.use(errorHandler);

// ---------- Socket.io ----------
io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('A client disconnected:', socket.id);
  });
});

socketService.initSocket(io);

const fileUpload = require('express-fileupload');
app.use(fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true
}));

// ---------- 启动 ----------
const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});