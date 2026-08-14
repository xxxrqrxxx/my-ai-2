// routes/activity.js - 手机活动上报 API
const express = require('express');
const router = express.Router();
const { supabase } = require('../db');

const REPORT_TOKEN = process.env.REPORT_TOKEN || '';

// 鉴权中间件
function auth(req, res, next) {
  if (!REPORT_TOKEN) return next();
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (token !== REPORT_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// 上报活动
router.post('/report', auth, async (req, res) => {
  try {
    const { app_name, app } = req.body;
    const name = app_name || app || 'unknown';
    const { data, error } = await supabase
      .from('phone_activity')
      .insert([{ app_name: name }])
      .select();
    if (error) throw error;
    
    // 只保留最近100条
    const { data: recent } = await supabase
      .from('phone_activity')
      .select('id')
      .order('opened_at', { ascending: false })
      .limit(100);
    if (recent && recent.length > 0) {
      const keepIds = recent.map(r => r.id);
      await supabase
        .from('phone_activity')
        .delete()
        .not('id', 'in', `(${keepIds.join(',')})`);
    }
    
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取活动记录
router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('phone_activity')
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取活动摘要
router.get('/summary', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('phone_activity')
      .select('*')
      .order('opened_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.json({ last_active: null, recent_apps: [], count: 0 });
    }
    
    const last_active = data[0].opened_at;
    const recent_apps = [...new Set(data.map(r => r.app_name))].slice(0, 10);
    
    res.json({ last_active, recent_apps, count: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 健康检查
router.get('/ping', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;
