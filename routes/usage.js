// routes/usage.js - 用量统计 API
const express = require('express');
const router = express.Router();
const { supabase } = require('../db');

// 获取用量统计
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('api_usage')
      .select('model, tokens, created_at');
    
    if (error) throw error;
    
    // 按模型分组统计
    const byModel = {};
    let total = 0;
    let today = 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    (data || []).forEach(item => {
      byModel[item.model] = (byModel[item.model] || 0) + item.tokens;
      total += item.tokens;
      if (new Date(item.created_at) >= todayStart) {
        today += item.tokens;
      }
    });
    
    // 格式化成前端需要的格式
    const models = Object.entries(byModel).map(([model, used]) => ({
      modelId: model,
      name: model,
      used,
      total: 1000000, // 每月额度，可改
    }));
    
    res.json({ models, total, today });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
