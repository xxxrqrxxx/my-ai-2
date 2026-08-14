// server.js - Express 服务器入口

require('dotenv').config();

const express = require('express');

const cors = require('cors');

const { initDatabase } = require('./db');

const { startDiaryScheduler } = require('./diaryScheduler');

const { startProactiveMessenger } = require('./proactiveMessenger');

const pushRoutes = require('./routes/push');

const activityRoutes = require('./routes/activity');

const app = express();

const PORT = process.env.PORT || 3000;

const whisperRoutes = require('./routes/whispers');
const letterRoutes = require('./routes/letters');



// 中间件

app.use(cors());

app.use(express.json({ limit: '50mb' }));


// 初始化数据库

initDatabase();


// 健康检查

app.get('/api/health', (req, res) => {

  res.json({ status: 'ok', service: 'Arden Backend', time: new Date().toISOString() });

});


// 路由

app.use('/api/sessions', require('./routes/sessions'));

app.use('/api/messages', require('./routes/messages'));

app.use('/api/chat', require('./routes/chat'));

app.use('/api/memories', require('./routes/memories'));

app.use('/api/settings', require('./routes/settings'));

app.use('/api/activity', require('./routes/activity'));

app.use('/api/mind', require('./routes/mind'));

app.use('/api/usage', require('./routes/usage'));

app.use('/api/mcp', require('./routes/mcp'));

app.use('/api/push', pushRoutes);

app.use('/api/activity', activityRoutes);

app.use('/api/whispers', whisperRoutes);

app.use('/api/letters', letterRoutes);




// 错误处理

app.use((err, req, res, next) => {

  console.error('服务器错误:', err);

  res.status(500).json({ error: '服务器内部错误' });

});

// 启动日记定时任务（每天 23:30 自动写日记）

startDiaryScheduler();
startProactiveMessenger();


app.listen(PORT, () => {

  console.log(`🚀 Arden 后端运行在 http://localhost:${PORT}`);

});
