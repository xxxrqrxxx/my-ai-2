// routes/memories.js - 记忆管理 API
const express = require('express');
const router = express.Router();
const ombre = require('../ombreBrain');

// 获取所有记忆
router.get('/', async (req, res) => {
  try {
    const { category, search, limit } = req.query;
    const memories = await ombre.getAll({ category, search, limit: limit ? parseInt(limit) : 100 });
    res.json(memories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 记忆浮现（根据上下文召回）
router.post('/breath', async (req, res) => {
  try {
    const { query, limit, category } = req.body;
    const memories = await ombre.breath(query || '', limit || 5, category);
    // 访问时增加脉冲
    memories.forEach(m => ombre.pulse(m.id));
    res.json(memories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新建记忆
router.post('/', async (req, res) => {
  try {
    const { title, content, category, importance, emotional_valence, keywords, domain_tags, source } = req.body;
    if (!title) return res.status(400).json({ error: '标题不能为空' });
    const memory = await ombre.hold({
      title,
      content: content || '',
      category: category || '日常',
      importance: importance || 3,
      emotional_valence: emotional_valence || 'neutral',
      keywords: keywords || [],
      domain_tags: domain_tags || [],
      source: source || 'manual',
    });
    res.json(memory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 更新记忆
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const memory = await ombre.update(parseInt(id), req.body);
    res.json(memory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 遗忘记忆（软删除）
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ombre.forget(parseInt(id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 彻底删除
router.delete('/:id/purge', async (req, res) => {
  try {
    const { id } = req.params;
    await ombre.purge(parseInt(id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 恢复记忆
router.post('/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    const memory = await ombre.restore(parseInt(id));
    res.json(memory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 锚定记忆（标记重要）
router.post('/:id/anchor', async (req, res) => {
  try {
    const { id } = req.params;
    const { importance } = req.body;
    const memory = await ombre.anchor(parseInt(id), importance || 5);
    res.json(memory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 释放记忆（降低权重）
router.post('/:id/release', async (req, res) => {
  try {
    const { id } = req.params;
    const memory = await ombre.release(parseInt(id));
    res.json(memory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 追溯记忆来源
router.get('/:id/trace', async (req, res) => {
  try {
    const { id } = req.params;
    const trace = await ombre.trace(parseInt(id));
    res.json(trace);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 记忆成长（定期整理，后台调用）
router.post('/grow', async (req, res) => {
  try {
    const result = await ombre.grow();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取自我认知
router.get('/identity/list', async (req, res) => {
  try {
    const identity = await ombre.getIdentity();
    res.json(identity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取计划
router.get('/plan/list', async (req, res) => {
  try {
    const plans = await ombre.getPlans();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取信件
router.get('/letter/list', async (req, res) => {
  try {
    const letters = await ombre.getLetters();
    res.json(letters);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
