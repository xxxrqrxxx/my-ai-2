// ombreBrain.js - Ombre Brain 风格记忆引擎
// 11种记忆操作：breath/hold/grow/trace/anchor/release/forget/restore/purge/I/plan/letter/pulse
// 去掉 dream（用户不需要）

const { supabase } = require('./db');

// ========== 记忆表操作 ==========

/**
 * breath - 记忆浮现：根据当前上下文召回相关记忆
 * @param {string} query - 当前对话/上下文
 * @param {number} limit - 返回数量
 * @param {string} category - 可选分类过滤
 */
async function breath(query, limit = 5, category = null) {
  try {
    let request = supabase
      .from('memories')
      .select('*')
      .eq('deleted', false)
      .order('pulse', { ascending: false })
      .order('importance', { ascending: false })
      .limit(limit * 3); // 多取一些再过滤

    if (category) {
      request = request.eq('category', category);
    }

    const { data, error } = await request;
    if (error) throw error;

    // 简单关键词匹配打分
    const queryWords = (query || '').toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const scored = data.map(m => {
      let score = m.pulse * 0.3 + (m.importance / 5) * 0.4;
      const content = (m.title + ' ' + m.content + ' ' + (m.keywords || []).join(' ')).toLowerCase();
      queryWords.forEach(word => {
        if (content.includes(word)) score += 0.15;
      });
      return { ...m, _score: score };
    });

    scored.sort((a, b) => b._score - a._score);
    return scored.slice(0, limit);
  } catch (err) {
    console.error('[breath] 错误:', err.message);
    return [];
  }
}

/**
 * hold - 保存新记忆
 */
async function hold({ title, content, category = '日常', importance = 3, emotional_valence = 'neutral', keywords = [], domain_tags = [], source = 'auto', trace = null, model_used = null }) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .insert([{
        title,
        content,
        category,
        importance,
        emotional_valence,
        keywords,
        domain_tags,
        pulse: 1.0,
        source,
        trace,
        model_used,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived: false,
        deleted: false,
      }])
      .select();

    if (error) throw error;
    return data[0];
  } catch (err) {
    console.error('[hold] 错误:', err.message);
    return null;
  }
}

/**
 * grow - 记忆成长：定期整理、关联、提炼
 * 找出高脉冲/高重要性的记忆，合并相似内容，提炼关键词
 */
async function grow() {
  try {
    // 取所有活跃记忆
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('deleted', false)
      .eq('archived', false)
      .order('pulse', { ascending: false });

    if (error) throw error;
    if (!data || data.length < 2) return { merged: 0, updated: 0 };

    // 简单的脉冲衰减（所有记忆 pulse *= 0.95）
    let updated = 0;
    for (const m of data) {
      const newPulse = Math.max(0.1, (m.pulse || 1) * 0.95);
      await supabase
        .from('memories')
        .update({ pulse: newPulse, updated_at: new Date().toISOString() })
        .eq('id', m.id);
      updated++;
    }

    return { merged: 0, updated };
  } catch (err) {
    console.error('[grow] 错误:', err.message);
    return { merged: 0, updated: 0 };
  }
}

/**
 * trace - 追溯记忆来源
 */
async function trace(memoryId) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('id', memoryId)
      .single();

    if (error) throw error;
    return {
      memory: data,
      source: data.source,
      trace: data.trace,
      created_at: data.created_at,
    };
  } catch (err) {
    console.error('[trace] 错误:', err.message);
    return null;
  }
}

/**
 * anchor - 锚定重要记忆（提高重要性和脉冲）
 */
async function anchor(memoryId, importance = 5) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .update({
        importance,
        pulse: 1.0,
        archived: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memoryId)
      .select();

    if (error) throw error;
    return data[0];
  } catch (err) {
    console.error('[anchor] 错误:', err.message);
    return null;
  }
}

/**
 * release - 释放记忆（降低脉冲和重要性，不删除）
 */
async function release(memoryId) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .update({
        pulse: 0.2,
        importance: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memoryId)
      .select();

    if (error) throw error;
    return data[0];
  } catch (err) {
    console.error('[release] 错误:', err.message);
    return null;
  }
}

/**
 * forget - 遗忘记忆（软删除，可恢复）
 */
async function forget(memoryId) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .update({
        deleted: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memoryId)
      .select();

    if (error) throw error;
    return data[0];
  } catch (err) {
    console.error('[forget] 错误:', err.message);
    return null;
  }
}

/**
 * restore - 恢复被遗忘的记忆
 */
async function restore(memoryId) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .update({
        deleted: false,
        pulse: 0.5,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memoryId)
      .select();

    if (error) throw error;
    return data[0];
  } catch (err) {
    console.error('[restore] 错误:', err.message);
    return null;
  }
}

/**
 * purge - 彻底删除记忆（不可恢复）
 */
async function purge(memoryId) {
  try {
    const { error } = await supabase
      .from('memories')
      .delete()
      .eq('id', memoryId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[purge] 错误:', err.message);
    return false;
  }
}

/**
 * I - 自我认知：AI 对自己的认知/身份记忆
 * 特殊分类的记忆，存 Arden 的自我设定
 */
async function getIdentity() {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('category', 'identity')
      .eq('deleted', false)
      .order('importance', { ascending: false });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[I/getIdentity] 错误:', err.message);
    return [];
  }
}

async function setIdentity({ title, content, importance = 5 }) {
  return hold({
    title,
    content,
    category: 'identity',
    importance,
    source: 'manual',
  });
}

/**
 * plan - 计划记忆：未来计划/待办
 */
async function getPlans() {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('category', 'plan')
      .eq('deleted', false)
      .eq('archived', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[plan/getPlans] 错误:', err.message);
    return [];
  }
}

async function addPlan({ title, content, importance = 3 }) {
  return hold({
    title,
    content,
    category: 'plan',
    importance,
    source: 'manual',
  });
}

/**
 * letter - 信件记忆：Arden 给 Nana 的留言
 */
async function getLetters() {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('category', 'letter')
      .eq('deleted', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[letter/getLetters] 错误:', err.message);
    return [];
  }
}

async function addLetter({ title, content, importance = 4 }) {
  return hold({
    title,
    content,
    category: 'letter',
    importance,
    source: 'auto',
    model_used: 'gemini',
  });
}

/**
 * pulse - 记忆脉冲：访问记忆时增加活跃度
 */
async function pulse(memoryId) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .select('pulse')
      .eq('id', memoryId)
      .single();

    if (error) throw error;
    const newPulse = Math.min(1.0, (data.pulse || 0.5) + 0.2);

    await supabase
      .from('memories')
      .update({ pulse: newPulse, updated_at: new Date().toISOString() })
      .eq('id', memoryId);

    return newPulse;
  } catch (err) {
    console.error('[pulse] 错误:', err.message);
    return 0.5;
  }
}

/**
 * 获取所有记忆（前端列表用）
 */
async function getAll({ category = null, search = null, limit = 100 } = {}) {
  try {
    let request = supabase
      .from('memories')
      .select('*')
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category && category !== '全部') {
      request = request.eq('category', category);
    }

    const { data, error } = await request;
    if (error) throw error;

    if (search) {
      const q = search.toLowerCase();
      return data.filter(m =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.content || '').toLowerCase().includes(q)
      );
    }

    return data;
  } catch (err) {
    console.error('[getAll] 错误:', err.message);
    return [];
  }
}

/**
 * 更新记忆
 */
async function update(memoryId, fields) {
  try {
    const { data, error } = await supabase
      .from('memories')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', memoryId)
      .select();

    if (error) throw error;
    return data[0];
  } catch (err) {
    console.error('[update] 错误:', err.message);
    return null;
  }
}

/**
 * 把记忆格式化成提示词文本（给 AI 用）
 */
function formatForPrompt(memories) {
  if (!memories || memories.length === 0) return '';
  return memories.map(m => {
    const imp = '★'.repeat(m.importance || 3);
    return `[${m.category || '日常'}] ${imp} ${m.title}: ${m.content}`;
  }).join('\n');
}

module.exports = {
  breath,
  hold,
  grow,
  trace,
  anchor,
  release,
  forget,
  restore,
  purge,
  getIdentity,
  setIdentity,
  getPlans,
  addPlan,
  getLetters,
  addLetter,
  pulse,
  getAll,
  update,
  formatForPrompt,
};
