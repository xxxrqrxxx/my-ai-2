// backend/routes/settings.js
// 设置读写 API

const express = require('express');
const router = express.Router();
const supabase = require('../db');

/**
 * GET /api/settings
 * 获取当前设置
 */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .single();

    if (error) {
      // 如果没有设置记录，返回默认值
      if (error.code === 'PGRST116') {
        return res.json({
          id: 1,
          system_prompt: '你是一个温柔体贴的AI伙伴。',
          temperature: 0.8,
          compress_threshold: 6000,
          compress_keep_rounds: 6,
          compress_model: 'qwen-plus',
          max_reply_tokens: 2000
        });
      }
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error('❌ 获取设置失败:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/settings
 * 更新设置
 */
router.patch('/', async (req, res) => {
  try {
    const updateData = {};

    // 允许更新的字段
    const allowedFields = [
      'system_prompt',
      'temperature',
      'compress_threshold',
      'compress_keep_rounds',
      'compress_model',
      'max_reply_tokens'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }

    updateData.updated_at = new Date().toISOString();

    // 先尝试更新
    let { data, error } = await supabase
      .from('settings')
      .update(updateData)
      .eq('id', 1)
      .select()
      .single();

    // 如果没有记录，插入一条
    if (error && error.code === 'PGRST116') {
      const insertData = {
        id: 1,
        system_prompt: '你是一个温柔体贴的AI伙伴。',
        temperature: 0.8,
        compress_threshold: 6000,
        compress_keep_rounds: 6,
        compress_model: 'qwen-plus',
        max_reply_tokens: 2000,
        ...updateData
      };

      const result = await supabase
        .from('settings')
        .insert(insertData)
        .select()
        .single();

      data = result.data;
      error = result.error;
    }

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error('❌ 更新设置失败:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
