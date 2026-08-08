// backend/memory.js
// 记忆压缩模块 - 用千问做压缩，全局共享一份记忆

const supabase = require('./db');
const { askAI } = require('./ai');

/**
 * 估算文本的 token 数
 * 中文大概 1.5 字符 = 1 token，英文大概 4 字符 = 1 token
 * 这里取保守值 1.5，宁可多算一点也不要少算
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 1.5);
}

/**
 * 加载所有记忆，拼接成一段文本
 * 全局共享，所有会话共用同一份记忆
 */
async function loadMemory() {
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('❌ 加载记忆失败:', error.message);
    return '';
  }

  if (!data || data.length === 0) return '';

  // 拼接所有记忆，每条标明来源和标题
  const memoryLines = data.map(m => {
    const sourceLabel = m.source === 'user' ? '手动记录' : `自动摘要(${m.model_used || 'AI'})`;
    return `[${sourceLabel}] ${m.title || '记忆'}: ${m.summary}`;
  });

  return memoryLines.join('\n');
}

/**
 * 检查是否需要压缩，如果需要就执行压缩
 * @param {number} sessionId - 会话 ID
 * @param {object} settings - 设置对象
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

    // 3. 计算要保留的最近 N 轮（一轮 = 用户 + AI 两条消息）
    const keepRounds = settings.compress_keep_rounds || 6;
    const keepCount = keepRounds * 2; // 每轮两条消息

    if (messages.length <= keepCount) {
      console.log('ℹ️ 消息太少，不需要压缩');
      return;
    }

    // 4. 取出要压缩的消息（前面的部分）
    const toCompress = messages.slice(0, messages.length - keepCount);
    const keepMessages = messages.slice(messages.length - keepCount);

    console.log(`🗜️ 开始压缩: ${toCompress.length} 条消息 → 压缩为摘要，保留最近 ${keepRounds} 轮`);

    // 5. 组装对话文本
    const conversationText = toCompress
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
      .join('\n');

    // 6. 用 AI 压缩（默认用千问）
    const compressModel = settings.compress_model || 'qwen-plus';
    const summary = await askAI({
      model: compressModel,
      systemPrompt: '你是一个对话摘要助手。请将以下对话内容压缩为一段简洁的摘要，保留关键事实、情感基调和重要细节。用中文输出，不要超过300字。只输出摘要内容，不要加任何解释。',
      messages: [{ role: 'user', content: conversationText }],
      maxTokens: 500,
      temperature: 0.3
    });

    // 7. 生成标题（用 AI 生成一个简短标题）
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

    // 8. 保存摘要到 memories 表
    const { error: insertError } = await supabase
      .from('memories')
      .insert({
        summary: summary,
        title: title,
        tag: '日常',
        source: 'auto',
        model_used: compressModel,
        conversation_id: String(sessionId)
      });

    if (insertError) {
      console.error('❌ 保存记忆摘要失败:', insertError.message);
      return;
    }

    // 9. 将被压缩的消息标记为不可见
    const idsToHide = toCompress.map(m => m.id);
    const { error: updateError } = await supabase
      .from('messages')
      .update({ visible: false })
      .in('id', idsToHide);

    if (updateError) {
      console.error('❌ 隐藏旧消息失败:', updateError.message);
      return;
    }

    console.log(`✅ 压缩完成！生成摘要: "${title}"，隐藏了 ${idsToHide.length} 条旧消息`);

  } catch (err) {
    console.error('❌ 记忆压缩失败:', err.message);
  }
}

module.exports = {
  estimateTokens,
  loadMemory,
  compressIfNeeded
};
