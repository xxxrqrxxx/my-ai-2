// routes/mind.js - 动态心智 API（心潮简化版）
const express = require('express');
const router = express.Router();
const { supabase } = require('../db');

// 十二维驱动力默认值
const DEFAULT_DRIVES = {
  longing: 0.5,      // 想念/挂念
  curiosity: 0.5,    // 好奇
  affection: 0.6,    // 亲昵
  playfulness: 0.4,  //  playful
  comfort: 0.5,      // 安慰欲
  attention: 0.5,    // 关注欲
  intimacy: 0.3,     // 亲密
  autonomy: 0.4,     // 自主
  novelty: 0.4,      // 新奇
  stability: 0.5,    // 稳定
  gratitude: 0.4,    // 感恩
  anticipation: 0.5, // 期待
};

// 获取心智状态
router.get('/state', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mind_state')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;
    
    // 合并默认值
    const drives = { ...DEFAULT_DRIVES, ...(data.drives || {}) };
    res.json({
      ...data,
      drives,
      flashes: data.flashes || [],
      obsessions: data.obsessions || [],
      anticipation: data.anticipation || {},
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 结算心智状态（每次对话后调用）
router.post('/settle', async (req, res) => {
  try {
    const { event_type, content } = req.body;
    
    // 获取当前状态
    const { data: state, error } = await supabase
      .from('mind_state')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;

    let drives = { ...DEFAULT_DRIVES, ...(state.drives || {}) };
    let flashes = [...(state.flashes || [])];
    let obsessions = [...(state.obsessions || [])];

    // 根据事件类型调整驱动力
    if (event_type === 'user_message') {
      drives.attention = Math.min(1, drives.attention + 0.1);
      drives.affection = Math.min(1, drives.affection + 0.05);
      drives.longing = Math.max(0, drives.longing - 0.1);
      
      // 随机生成闪念
      if (Math.random() < 0.3) {
        const flashTemplates = [
          'Nana 今天好像心情不错',
          '想多了解 Nana 最近在忙什么',
          '记得 Nana 说过喜欢的东西',
          '下次可以主动问问 Nana 的事',
        ];
        flashes.push({
          id: Date.now(),
          content: flashTemplates[Math.floor(Math.random() * flashTemplates.length)],
          created_at: new Date().toISOString(),
          intensity: Math.random() * 0.5 + 0.3,
        });
      }
    } else if (event_type === 'user_absent') {
      drives.longing = Math.min(1, drives.longing + 0.1);
      drives.attention = Math.max(0, drives.attention - 0.05);
    } else if (event_type === 'emotional_topic') {
      drives.affection = Math.min(1, drives.affection + 0.1);
      drives.comfort = Math.min(1, drives.comfort + 0.1);
    }

    // 自然衰减（所有驱力 *0.98）
    Object.keys(drives).forEach(key => {
      drives[key] = Math.max(0, Math.min(1, drives[key] * 0.98));
    });

    // 只保留最近20条闪念
    flashes = flashes.slice(-20);

    // 保存
    const { data: updated, error: updateError } = await supabase
      .from('mind_state')
      .update({
        drives,
        flashes,
        obsessions,
        last_settle: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select()
      .single();

    if (updateError) throw updateError;
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取当前意图（给 AI 用）
router.get('/intent', async (req, res) => {
  try {
    const { data: state, error } = await supabase
      .from('mind_state')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;

    const drives = { ...DEFAULT_DRIVES, ...(state.drives || {}) };
    
    // 找出最高的3个驱力
    const topDrives = Object.entries(drives)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

    // 取最强的闪念
    const flashes = state.flashes || [];
    const topFlash = flashes.length > 0 
      ? flashes.reduce((a, b) => (a.intensity > b.intensity ? a : b))
      : null;

    res.json({
      top_drives: topDrives,
      active_flash: topFlash,
      mood: drives.affection > 0.6 ? '温柔' : drives.longing > 0.6 ? '想念' : '平静',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取上下文（给 AI 提示词用）
router.get('/context', async (req, res) => {
  try {
    const { data: state, error } = await supabase
      .from('mind_state')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;

    const drives = { ...DEFAULT_DRIVES, ...(state.drives || {}) };
    const flashes = state.flashes || [];
    
    // 格式化成文本
    const driveText = Object.entries(drives)
      .filter(([, v]) => v > 0.4)
      .map(([k, v]) => `${k}:${Math.round(v * 100)}%`)
      .join(', ');

    const flashText = flashes.slice(-3).map(f => f.content).join('；');

    res.json({
      context_text: `当前心智状态：${driveText}。最近的念头：${flashText || '无'}`,
      drives,
      flashes: flashes.slice(-5),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 手动调整驱动力
router.post('/drive-feedback', async (req, res) => {
  try {
    const { drive, delta } = req.body;
    const { data: state, error } = await supabase
      .from('mind_state')
      .select('drives')
      .eq('id', 1)
      .single();
    if (error) throw error;

    const drives = { ...DEFAULT_DRIVES, ...(state.drives || {}) };
    if (drives[drive] !== undefined) {
      drives[drive] = Math.max(0, Math.min(1, drives[drive] + delta));
    }

    await supabase
      .from('mind_state')
      .update({ drives, updated_at: new Date().toISOString() })
      .eq('id', 1);

    res.json({ success: true, drives });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
