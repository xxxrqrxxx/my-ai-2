// backend/memory.js
// 记忆压缩模块 - 集成 Ombre Brain
const { supabase } = require('./db');
const { askAI } = require('./ai');
const ombre = require('./ombreBrain');

/**
 * 估算文本的 token 数
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 1.5);
}

/**
 * 加载所有记忆，拼接成一段文本（给 AI 提示词用）
 */
async function loadMemory(query = null, limit = 8) {
  try {
    let memories;
    if (query) {
      // 有查询词时，用 breath 召回相关记忆
      memories = await ombre.breath(query, limit);
    } else {
      memories = await ombre.getAll({ limit });
    }
    if (!memories || memories.length === 0) return '';
    return ombre.formatForPrompt(memories);
  } catch (err) {
    console.error('❌ 加载记忆失败:', err.message);
    return '';
  }
}

/**
 * 检查是否需要压缩，如果需要就执行压缩
 */
async function compressIfNeeded(sessionId, settings) {
  try {
    // 1. 获取当前会话所有可见消息
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('visible', true)
      .order('created_at', { ascending: true });
    if (msgError) {
      console.error('❌ 获取消息失败:', msgError.message);
      return;
    }
    if (!messages || messages.length === 0) return;

    // 2. 计算总 token 数
    const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const threshold = settings.compress_threshold || 6000;
    console.log(`📊 当前会话 token: ${totalTokens} / 阈值: ${threshold}`);

    if (totalTokens < threshold) {
      console.log('✅ 未达到压缩阈值，跳过');
      return;
    }

    // 3. 计算要保留的最近 N 轮
    const keepRounds = settings.compress_keep_rounds || 6;
    const keepCount = keepRounds * 2;
    if (messages.length <= keepCount) {
      console.log('ℹ️ 消息太少，不需要压缩');
      return;
    }

    // 4. 取出要压缩的消息
    const toCompress = messages.slice(0, messages.length - keepCount);
    console.log(`🗜️ 开始压缩: ${toCompress.length} 条消息 → 摘要，保留最近 ${keepRounds} 轮`);

    // 5. 组装对话文本
    const conversationText = toCompress
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
      .join('\n');

    // 6. 用 AI 压缩
    const compressModel = settings.compress_model || settings.model || 'gemini-3.5-flash';
    const summary = await askAI({
      model: compressModel,
      systemPrompt: '你是一个对话摘要助手。请将以下对话内容压缩为一段简洁的摘要，保留关键事实、情感基调和重要细节。用中文输出，不要超过300字。只输出摘要内容，不要加任何解释。',
      messages: [{ role: 'user', content: conversationText }],
      maxTokens: 500,
      temperature: 0.3
    });

    // 7. 生成标题
    let title = '对话摘要';
    try {
      const titleResult = await askAI({
        model: compressModel,
        systemPrompt: '请为以下对话摘要生成一个不超过10个字的简短标题，概括核心内容。只输出标题，不要加任何标点或解释。',
        messages: [{ role: 'user', content: summary }],
        maxTokens: 50,
        temperature: 0.3
      });
      if (titleResult && titleResult.trim()) {
        title = titleResult.trim().replace(/[。！？、，.]/g, '').slice(0, 15);
      }
    } catch (titleErr) {
      console.warn('⚠️ 生成标题失败，使用默认标题');
    }

    // 8. 用 ombreBrain 保存记忆
    await ombre.hold({
      title,
      content: summary,
      category: '日常',
      importance: 3,
      source: 'auto',
      model_used: compressModel,
      trace: `session:${sessionId}`,
    });

    // 9. 将被压缩的消息标记为不可见
    const idsToHide = toCompress.map(m => m.id);
    await supabase
      .from('messages')
      .update({ visible: false })
      .in('id', idsToHide);

    console.log(`✅ 压缩完成！生成记忆: "${title}"，隐藏了 ${idsToHide.length} 条旧消息`);
  } catch (err) {
    console.error('❌ 记忆压缩失败:', err.message);
  }
}

/**
 * 输出回流：分析 AI 回复，提取关于用户的新信息，自动保存为记忆
 */
async function outputFeedback(userMessage, aiReply, model) {
  try {
    // 用 AI 分析回复中是否有关于用户的新信息
    const analysis = await askAI({
      model: model || 'gemini-3.5-flash',
      systemPrompt: `你是一个记忆提取助手。请分析以下对话，判断 AI 的回复中是否透露了关于用户的新事实、偏好或重要信息。
如果有，请提取为一条简短的记忆，格式为：标题|内容|分类（日常/偏好/情感/重要）
如果没有新信息，只回复 "无"。
只输出结果，不要解释。`,
      messages: [
        { role: 'user', content: `用户说：${userMessage}\nAI回复：${aiReply}` }
      ],
      maxTokens: 200,
      temperature: 0.2
    });

    if (!analysis || analysis.trim() === '无' || analysis.includes('无')) {
      return null;
    }

    // 解析结果
    const parts = analysis.split('|').map(s => s.trim());
    if (parts.length >= 2) {
      const [title, content, category = '日常'] = parts;
      const memory = await ombre.hold({
        title: title.slice(0, 50),
        content: content.slice(0, 500),
        category,
        importance: 3,
        source: 'auto',
        model_used: model,
        trace: 'output_feedback',
      });
      console.log(`💡 输出回流：提取新记忆 "${title}"`);
      return memory;
    }
    return null;
  } catch (err) {
    console.error('❌ 输出回流失败:', err.message);
    return null;
  }
}

module.exports = {
  estimateTokens,
  loadMemory,
  compressIfNeeded,
  outputFeedback,
};
