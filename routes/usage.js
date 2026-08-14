// routes/usage.js - 用量统计 API
const express = require('express');
const router = express.Router();
const { supabase } = require('../db');

// 各模型免费额度配置（从你的资源包确认）
const MODEL_QUOTA = {
  'glm-4.5-air': 22000000,       // 智谱：1000万 + 1200万
  'glm-4.6v': 6000000,           // 智谱视觉
  'glm-4.1v-thinking': 10000000, // 智谱思考
  'qwen-plus': 1000000,          // 千问
  'qwen3-coder-plus': 1000000,   // 千问代码
  'qwen3.6-flash': 1000000,      // 千问轻量
  'claude-sonnet-4-6': 0,        // Claude 按量付费，无免费额度
};

// 模型显示名
const MODEL_NAMES = {
  'glm-4.5-air': 'GLM-4.5-Air（智谱）',
  'glm-4.6v': 'GLM-4.6V（智谱视觉）',
  'glm-4.1v-thinking': 'GLM-4.1V-Thinking（智谱思考）',
  'qwen-plus': 'Qwen-Plus（千问）',
  'qwen3-coder-plus': 'Qwen3-Coder-Plus（千问代码）',
  'qwen3.6-flash': 'Qwen3.6-Flash（千问轻量）',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
};

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
      name: MODEL_NAMES[model] || model,
      used,
      total: MODEL_QUOTA[model] !== undefined ? MODEL_QUOTA[model] : 1000000,
      remaining: MODEL_QUOTA[model] ? Math.max(0, MODEL_QUOTA[model] - used) : null,
    }));

    // 按用量从多到少排序
    models.sort((a, b) => b.used - a.used);
    
    res.json({ models, total, today });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
