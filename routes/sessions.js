// routes/sessions.js - 会话管理 API
const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { v4: uuidv4 } = require('uuid');

// 获取所有会话
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 创建会话
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    const id = uuidv4();
    const { data, error } = await supabase
      .from('sessions')
      .insert([{
        id,
        title: name || '新对话',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 删除会话
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 重命名会话
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, title } = req.body;
    const { data, error } = await supabase
      .from('sessions')
      .update({ 
        title: name || title, 
        updated_at: new Date().toISOString() 
      })
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
