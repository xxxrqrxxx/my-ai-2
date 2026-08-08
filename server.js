const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: '服务正常🐰' });
});
// 🩺 诊断 Supabase 连接
app.get('/api/db-check', async (req, res) => {
  try {
    const supabase = require('./db');
    const { count, error } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true });
    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
    }
    res.json({ success: true, sessionCount: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

// ===== 路由注册 =====
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/memories', require('./routes/memories'));   // 新增：记忆管理
app.use('/api/settings', require('./routes/settings'));   // 新增：设置管理

const PORT = process.env.PORT || 3000;
console.log('🔍 SUPABASE_URL 是否存在:', !!process.env.SUPABASE_URL);
console.log('🔗 SUPABASE_URL 实际值（前50字符）:', process.env.SUPABASE_URL?.slice(0, 50));
console.log('🔑 SUPABASE_KEY 是否存在:', !!process.env.SUPABASE_KEY);
console.log('🔑 SUPABASE_KEY 前10位:', process.env.SUPABASE_KEY?.slice(0, 10));
app.listen(PORT, () => {
    console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
    console.log(`🧠 记忆压缩功能已启用`);
    console.log(`📝 可用路由: /api/sessions, /api/messages, /api/chat, /api/memories, /api/settings`);
});
