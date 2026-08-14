const express = require('express');
const router = express.Router();
const { supabase } = require('../db');

// 获取悄悄话列表
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('whispers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 写悄悄话
router.post('/', async (req, res) => {
  try {
    const { author = 'nana', content } = req.body;
    if (!content) return res.status(400).json({ error: '内容不能为空' });
    const { data, error } = await supabase
      .from('whispers')
      .insert([{ author, content }])
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 回复悄悄话
router.patch('/:id/reply', async (req, res) => {
  try {
    const { id } = req.params;
    const { author = 'nana', content } = req.body;
    if (!content) return res.status(400).json({ error: '内容不能为空' });
    const reply = { author, content, created_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from('whispers')
      .update({ reply })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
