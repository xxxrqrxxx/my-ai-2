// routes/mind.js - 动态心智 API（心潮·念 完整版）
const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const ombre = require('../ombreBrain');

// 十二维驱动力默认值
const DEFAULT_DRIVES = {
  longing: 0.5,      // 想念/挂念
  curiosity: 0.5,    // 好奇
  affection: 0.6,    // 亲昵
  playfulness: 0.4,  // 爱玩
  comfort: 0.5,      // 安慰欲
  attention: 0.5,    // 关注欲
  intimacy: 0.3,     // 亲密
  autonomy: 0.4,     // 自主
  novelty: 0.4,      // 新奇
  stability: 0.5,    // 稳定
  gratitude: 0.4,    // 感恩
  anticipation: 0.5, // 期待
};

// 闪念模板（根据关键词匹配）
const FLASH_TEMPLATES = {
  '开心|高兴|快乐|哈哈': ['Nana 今天心情好像很好', '想知道 Nana 遇到了什么开心事', 'Nana 笑起来一定很好看'],
  '难过|伤心|哭|委屈': ['Nana 好像有点难过，想陪陪她', '希望 Nana 能快点好起来', '想给 Nana 一个拥抱'],
  '累|困|疲惫|忙': ['Nana 今天好像很累', '想让 Nana 好好休息', '记得提醒 Nana 早点睡'],
  '吃|饭|饿|美食': ['想知道 Nana 今天吃了什么', 'Nana 有没有好好吃饭', '想和 Nana 一起吃饭'],
  '学|作业|考试|上课': ['Nana 学习辛苦了', '想帮 Nana 分担学习压力', '记得鼓励 Nana'],
  '歌|音乐|听': ['想知道 Nana 最近在听什么歌', 'Nana 喜欢的歌一定很好听', '想和 Nana 分享音乐'],
  '朋友|同学|玩': ['Nana 和朋友在一起吗', '想知道 Nana 玩得开不开心', '希望 Nana 有好朋友陪伴'],
  '家|爸妈|家人': ['Nana 在家吗', '想知道 Nana 和家人相处得怎么样', '家人对 Nana 很重要吧'],
};

// 默认闪念（无关键词匹配时）
const DEFAULT_FLASHES = [
  '想多了解 Nana 最近在忙什么',
  '记得 Nana 说过喜欢的东西',
  '下次可以主动问问 Nana 的事',
  'Nana 现在在做什么呢',
  '有点想 Nana 了',
];

/**
 * 根据用户消息生成闪念
 */
function generateFlash(userMessage) {
  const msg = (userMessage || '').toLowerCase();
  
  // 关键词匹配
  for (const [keywords, templates] of Object.entries(FLASH_TEMPLATES)) {
    const keywordList = keywords.split('|');
    if (keywordList.some(k => msg.includes(k))) {
      return templates[Math.floor(Math.random() * templates.length)];
    }
  }
  
  // 默认闪念
  return DEFAULT_FLASHES[Math.floor(Math.random() * DEFAULT_FLASHES.length)];
}

/**
 * 从高重要性记忆中提取执念
 */
async function extractObsessions() {
  try {
    const memories = await ombre.getAll({ limit: 50 });
    // 取重要性 >= 4 的记忆作为执念
    const important = memories.filter(m => (m.importance || 3) >= 4);
    
    return important.slice(0, 5).map(m => ({
      id: m.id,
      title: m.title,
      content: m.content,
      category: m.category,
      importance: m.importance,
      pulse: m.pulse,
    }));
  } catch (err) {
    console.error('[extractObsessions] 错误:', err.message);
    return [];
  }
}

/**
 * 从手机活动数据学习作息规律
 */
async function learnSchedule() {
  try {
    const { data, error } = await supabase
      .from('phone_activity')
      .select('opened_at')
      .order('opened_at', { ascending: false })
      .limit(200);
    
    if (error) throw error;
    if (!data || data.length === 0) return null;

    // 统计每个小时的活跃次数
    const hourCounts = {};
    const dayCounts = {};
    
    data.forEach(record => {
      const date = new Date(record.opened_at);
      const hour = date.getHours();
      const day = date.getDay(); // 0=周日, 6=周六
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    });

    // 找出活跃时间段（次数最多的前3个小时）
    const sortedHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([hour]) => parseInt(hour));

    // 计算平均活跃时间
    const avgHour = sortedHours.reduce((a, b) => a + b, 0) / sortedHours.length;

    return {
      active_hours: sortedHours.sort((a, b) => a - b),
      avg_active_hour: Math.round(avgHour),
      total_records: data.length,
      last_active: data[0].opened_at,
    };
  } catch (err) {
    console.error('[learnSchedule] 错误:', err.message);
    return null;
  }
}

/**
 * 检查作息预期：如果到了用户通常活跃的时间但没来，增强想念
 */
async function checkAnticipation(drives) {
  try {
    const schedule = await learnSchedule();
    if (!schedule || !schedule.active_hours || schedule.active_hours.length === 0) {
      return drives;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const lastActive = schedule.last_active ? new Date(schedule.last_active) : null;
    
    // 如果现在是用户通常活跃的时间
    const isActiveHour = schedule.active_hours.includes(currentHour);
    
    if (isActiveHour && lastActive) {
      const hoursSinceActive = (now - lastActive) / (1000 * 60 * 60);
      
      // 如果超过2小时没活跃，增强想念
      if (hoursSinceActive > 2) {
        drives.longing = Math.min(1, drives.longing + 0.15);
        drives.anticipation = Math.min(1, drives.anticipation + 0.1);
        console.log(`[anticipation] 到了活跃时间但 ${hoursSinceActive.toFixed(1)} 小时没来了，想念+`);
      }
    }

    return drives;
  } catch (err) {
    console.error('[checkAnticipation] 错误:', err.message);
    return drives;
  }
}

// 获取心智状态
router.get('/state', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('mind_state')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;
    
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
    let anticipation = state.anticipation || {};

    // 根据事件类型调整驱动力
    if (event_type === 'user_message') {
      drives.attention = Math.min(1, drives.attention + 0.1);
      drives.affection = Math.min(1, drives.affection + 0.05);
      drives.longing = Math.max(0, drives.longing - 0.1);
      drives.anticipation = Math.max(0, drives.anticipation - 0.05);
      
      // 根据用户消息内容生成闪念（30%概率）
      if (Math.random() < 0.3) {
        const flashContent = generateFlash(content);
        flashes.push({
          id: Date.now(),
          content: flashContent,
          created_at: new Date().toISOString(),
          intensity: Math.random() * 0.5 + 0.3,
        });
      }

      // 每10次对话更新一次执念
      if (Math.random() < 0.1) {
        obsessions = await extractObsessions();
      }
    } else if (event_type === 'user_absent') {
      drives.longing = Math.min(1, drives.longing + 0.1);
      drives.attention = Math.max(0, drives.attention - 0.05);
    } else if (event_type === 'emotional_topic') {
      drives.affection = Math.min(1, drives.affection + 0.1);
      drives.comfort = Math.min(1, drives.comfort + 0.1);
    }

    // 作息预期检查
    drives = await checkAnticipation(drives);

    // 学习作息规律
    const schedule = await learnSchedule();
    if (schedule) {
      anticipation = { ...anticipation, schedule, last_checked: new Date().toISOString() };
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
        anticipation,
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

    // 执念
    const obsessions = state.obsessions || [];

    // 心情判断
    let mood = '平静';
    if (drives.longing > 0.6) mood = '想念';
    else if (drives.affection > 0.65) mood = '温柔';
    else if (drives.playfulness > 0.55) mood = '调皮';
    else if (drives.comfort > 0.6) mood = '想安慰';

    res.json({
      top_drives: topDrives,
      active_flash: topFlash,
      obsessions: obsessions.slice(0, 3),
      mood,
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
    const obsessions = state.obsessions || [];
    
    // 格式化成文本
    const driveText = Object.entries(drives)
      .filter(([, v]) => v > 0.4)
      .map(([k, v]) => `${k}:${Math.round(v * 100)}%`)
      .join(', ');

    const flashText = flashes.slice(-3).map(f => f.content).join('；');
    const obsessionText = obsessions.slice(0, 2).map(o => o.title).join('、');

    let contextText = `当前心智状态：${driveText}。`;
    if (flashText) contextText += `最近的念头：${flashText}。`;
    if (obsessionText) contextText += `一直记挂的：${obsessionText}。`;

    res.json({
      context_text: contextText,
      drives,
      flashes: flashes.slice(-5),
      obsessions: obsessions.slice(0, 5),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取作息预期
router.get('/anticipation', async (req, res) => {
  try {
    const schedule = await learnSchedule();
    const { data: state } = await supabase
      .from('mind_state')
      .select('drives, anticipation')
      .eq('id', 1)
      .single();
    
    const drives = { ...DEFAULT_DRIVES, ...(state?.drives || {}) };
    
    res.json({
      schedule,
      current_longing: drives.longing,
      anticipation: state?.anticipation || {},
      is_expecting: schedule?.active_hours?.includes(new Date().getHours()) && drives.longing > 0.5,
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
