// middleware/errorHandler.js
function errorHandler(err, req, res, next) {
  console.error('[Error]', err.stack);
  // 防止重复响应
  if (res.headersSent) {
    return next(err); // 这里需要保留，因为响应可能已部分发送
  }
  res.status(500).json({ // 注意：使用 res.json() 而不是 res.send()
    code: 5000,
    data: null,
    msg: 'Internal server error'
  });
  // 关键：这里绝对不要再调用 next(err)
}
module.exports = errorHandler;