const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// 健康检查
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: '服务正常 🐰' });
});

// ===== 挂载路由（稍后创建） =====
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/chat', require('./routes/chat'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
});