const express = require('express');
const router = express.Router();
const { supabase } = require('../db');

// 获取信件列表
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('letters')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 写信
router.post('/', async (req, res) => {
  try {
    const { author = 'nana', title, greeting, content, closing } = req.body;
    if (!content) return res.status(400).json({ error: '内容不能为空' });
    const { data, error } = await supabase
      .from('letters')
      .insert([{ author, title, greeting, content, closing }])
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
