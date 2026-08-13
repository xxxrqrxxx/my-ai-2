const express = require('express');
const router = express.Router();
const { supabase } = require('../db');

// 获取所有 MCP 服务器
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mcp_servers')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('获取MCP列表失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// 切换连接状态
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { data: existing } = await supabase
      .from('mcp_servers')
      .select('connected')
      .eq('id', req.params.id)
      .single();
    
    const { data, error } = await supabase
      .from('mcp_servers')
      .update({ connected: !existing?.connected, updated_at: new Date() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('切换MCP状态失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// 添加 MCP 服务器
router.post('/', async (req, res) => {
  try {
    const { name, url, command, args } = req.body;
    const { data, error } = await supabase
      .from('mcp_servers')
      .insert({ name, url, command, args, connected: false, tools: 0, builtin: false })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('添加MCP失败:', err);
    res.status(500).json({ error: err.message });
  }
});

// 删除 MCP 服务器
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('mcp_servers')
      .delete()
      .eq('id', req.params.id)
      .eq('builtin', false);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('删除MCP失败:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
