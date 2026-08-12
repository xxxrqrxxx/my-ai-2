// memory.js - 记忆压缩模块（集成 Ombre Brain）
const { supabase } = require('./db');
const ombre = require('./ombreBrain');
const ai = require('./ai');

/**
 * 加载所有记忆（给 AI 当上下文）
 */
async function loadMemory() {
  try {
    const memories = await ombre.getAll({ limit: 200 });
    if (memories.length === 0) return '';
    
    // 按重要性和脉冲排序，格式化成文本
    const sorted = memories
      .sort((a, b) => (b.importance * 2 + b.pulse) - (a.importance * 2 + a.pulse))
      .slice(0, 50); // 最多取50条
    
    return ombre.formatForPrompt(sorted);
  } catch (err) {
    console.error('[loadMemory] 错误:', err.message);
    return '';
  }
}

/**
 * 估算 token 数（简单估算：中文1字≈1.5 token，英文1词≈1.3 token）
 */
function estimateTokens(text) {
  if (!text) return 0;
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const english = (text.match(/[a-zA-Z]+/g) || []).length;
  return Math.floor(chinese * 1.5 + english * 1.3);
}

/**
 * 检查是否需要压缩，需要的话就压缩
 */
async function compressIfNeeded(sessionId, settings) {
  try {
    const threshold = settings.compress_threshold || 6000;
    const keepRounds = settings.keep_rounds || 6;
    const compressModel = settings.compress_model || 'gemini-2.0-flash';

    // 获取该会话所有可见消息
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('visible', true)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!messages || messages.length < keepRounds * 2 + 2) return { compressed: false };

    // 估算总 token
    const totalTokens = messages.reduce((sum, m) => sum + (m.tokens || estimateTokens(m.content)), 0);
    if (totalTokens < threshold) return { compressed: false };

    // 保留最近 N 轮，前面的压缩
    const keepCount = keepRounds * 2; // 每轮 user+assistant
    const toCompress = messages.slice(0, messages.length - keepCount);
    const toKeep = messages.slice(messages.length - keepCount);

    if (toCompress.length < 4) return { compressed: false };

    // 组装要压缩的对话文本
    const conversationText = toCompress.map(m => {
      const role = m.role === 'user' ? 'Nana' : 'Arden';
      return `${role}: ${m.content}`;
    }).join('\n\n');

    // 调用 AI 生成摘要
    const summaryPrompt = `请把下面这段对话压缩成几条关键记忆摘要，每条一行，格式为"[分类] 标题: 内容"。
分类可选：日常、重要、喜好、情绪。
只输出记忆条目，不要其他解释。

对话：
${conversationText}`;

    let summaryText = '';
    try {
      summaryText = await ai.generate({
        model: compressModel,
        systemPrompt: '你是一个记忆整理助手，擅长从对话中提取关键信息。',
        messages: [{ role: 'user', content: summaryPrompt }],
        maxTokens: 1500,
        temperature: 0.3,
      });
    } catch (aiErr) {
      console.error('[compress] AI 生成摘要失败:', aiErr.message);
      // 降级：用简单摘要
      summaryText = `[日常] 对话摘要: ${conversationText.slice(0, 200)}...`;
    }

    // 解析摘要，逐条存入 Ombre Brain
    const summaryLines = summaryText.split('\n').filter(line => line.trim());
    let savedCount = 0;
    
    for (const line of summaryLines) {
      // 尝试解析 "[分类] 标题: 内容" 格式
      const match = line.match(/\[(.+?)\]\s*(.+?)[:：]\s*(.+)/);
      if (match) {
        const [, category, title, content] = match;
        await ombre.hold({
          title: title.trim(),
          content: content.trim(),
          category: ['日常', '重要', '喜好', '情绪'].includes(category.trim()) ? category.trim() : '日常',
          importance: category.trim() === '重要' ? 4 : 3,
          source: 'compress',
          trace: `session:${sessionId}`,
          model_used: compressModel,
        });
        savedCount++;
      } else if (line.trim()) {
        // 解析失败就整条存
        await ombre.hold({
          title: '对话摘要',
          content: line.trim(),
          category: '自动压缩',
          importance: 2,
          source: 'compress',
          trace: `session:${sessionId}`,
          model_used: compressModel,
        });
        savedCount++;
      }
    }

    // 把旧消息标记为不可见
    const toCompressIds = toCompress.map(m => m.id);
    await supabase
      .from('messages')
      .update({ visible: false })
      .in('id', toCompressIds);

    console.log(`[compress] 会话 ${sessionId} 压缩完成，生成 ${savedCount} 条记忆，隐藏 ${toCompressIds.length} 条旧消息`);
    return { compressed: true, savedCount, hiddenCount: toCompressIds.length };
  } catch (err) {
    console.error('[compressIfNeeded] 错误:', err.message);
    return { compressed: false, error: err.message };
  }
}

/**
 * 生成会话标题
 */
async function generateTitle(sessionId, firstMessage) {
  try {
    const settings = await getSettings();
    const compressModel = settings?.compress_model || 'gemini-2.0-flash';
    
    const title = await ai.generate({
      model: compressModel,
      systemPrompt: '你是一个标题生成助手，用简短的中文（不超过10字）概括对话主题。',
      messages: [{ role: 'user', content: `给这段对话起个标题：${firstMessage}` }],
      maxTokens: 50,
      temperature: 0.5,
    });

    const cleanTitle = title.replace(/[""''《》]/g, '').slice(0, 20);
    
    await supabase
      .from('sessions')
      .update({ title: cleanTitle })
      .eq('id', sessionId);

    return cleanTitle;
  } catch (err) {
    console.error('[generateTitle] 错误:', err.message);
    return '新对话';
  }
}

/**
 * 获取设置
 */
async function getSettings() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[getSettings] 错误:', err.message);
    return {
      model: 'gemini-2.0-flash',
      compress_model: 'gemini-2.0-flash',
      compress_threshold: 6000,
      keep_rounds: 6,
    };
  }
}

module.exports = {
  loadMemory,
  compressIfNeeded,
  generateTitle,
  getSettings,
  estimateTokens,
};
