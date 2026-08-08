// backend/routes/memories.js
// 记忆管理 API - 增删改查

const express = require('express');
const router = express.Router();
const supabase = require('../db');

/**
 * GET /api/memories
 * 获取所有记忆
 */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // 格式化返回数据，兼容前端
    const formatted = (data || []).map(m => ({
      id: m.id,
      title: m.title || '对话摘要',
      text: m.summary,           // 前端用 text，数据库用 summary
      tag: m.tag || '日常',
      source: m.source || 'auto',
      model_used: m.model_used,
      time: formatTime(m.timestamp),
      timestamp: m.timestamp
    }));

    res.json(formatted);
  } catch (err) {
    console.error('❌ 获取记忆失败:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/memories
 * 手动添加记忆
 * Body: { title, text, tag }
 */
router.post('/', async (req, res) => {
  try {
    const { title, text, tag = '日常' } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: '记忆内容不能为空' });
    }

    const { data, error } = await supabase
      .from('memories')
      .insert({
        title: title || '手动记录',
        summary: text.trim(),
        tag: tag,
        source: 'user',  // 手动添加的标记为 user
        model_used: null
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const formatted = {
      id: data.id,
      title: data.title,
      text: data.summary,
      tag: data.tag,
      source: data.source,
      model_used: data.model_used,
      time: formatTime(data.timestamp),
      timestamp: data.timestamp
    };

    res.json(formatted);
  } catch (err) {
    console.error('❌ 添加记忆失败:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/memories/:id
 * 更新记忆
 * Body: { title, text, tag }
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, text, tag } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (text !== undefined) updateData.summary = text;
    if (tag !== undefined) updateData.tag = tag;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }

    const { data, error } = await supabase
      .from('memories')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const formatted = {
      id: data.id,
      title: data.title,
      text: data.summary,
      tag: data.tag,
      source: data.source,
      model_used: data.model_used,
      time: formatTime(data.timestamp),
      timestamp: data.timestamp
    };

    res.json(formatted);
  } catch (err) {
    console.error('❌ 更新记忆失败:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/memories/:id
 * 删除记忆
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('memories')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('❌ 删除记忆失败:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 格式化时间为 "X月X日更新" 格式
 */
function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '今天更新';
  if (diffDays === 1) return '昨天更新';
  if (diffDays < 7) return `${diffDays}天前更新`;

  return `${date.getMonth() + 1}月${date.getDate()}日更新`;
}

module.exports = router;