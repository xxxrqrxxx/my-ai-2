// routes/messages.js - 消息管理 API
const express = require('express');
const router = express.Router();
const { supabase } = require('../db');

// 获取会话消息
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('visible', true)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 发送消息（也可以直接用 /api/chat）
router.post('/', async (req, res) => {
  try {
    const { session_id, role, content } = req.body;
    const { data, error } = await supabase
      .from('messages')
      .insert([{ session_id, role, content }])
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
