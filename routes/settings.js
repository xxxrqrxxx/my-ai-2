// routes/settings.js - 设置 API
const express = require('express');
const router = express.Router();
const { supabase } = require('../db');

// 获取设置
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新设置
router.patch('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
