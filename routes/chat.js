// routes/chat.js - 核心对话接口
const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const ai = require('../ai');
const memory = require('../memory');
const ombre = require('../ombreBrain');

// 发送消息
router.post('/', async (req, res) => {
  try {
    const { sessionId, message, model } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId 和 message 必填' });
    }

    // 获取设置
    const settings = await memory.getSettings();
    const useModel = model || settings.model || 'gemini-2.0-flash';

    // 保存用户消息
    const { data: userMsg, error: userMsgError } = await supabase
      .from('messages')
      .insert([{
        session_id: sessionId,
        role: 'user',
        content: message,
        tokens: memory.estimateTokens(message),
      }])
      .select()
      .single();
    if (userMsgError) throw userMsgError;

    // 加载历史消息（可见的）
    const { data: history, error: historyError } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('visible', true)
      .order('created_at', { ascending: true });
    if (historyError) throw historyError;

    // 加载记忆（Ombre Brain 浮现）
    const relevantMemories = await ombre.breath(message, 8);
    const memoryText = ombre.formatForPrompt(relevantMemories);

    // 加载心智状态
    let mindContext = '';
    try {
      const { data: mindState } = await supabase
        .from('mind_state')
        .select('drives, flashes')
        .eq('id', 1)
        .single();
      if (mindState) {
        const drives = mindState.drives || {};
        const topDrive = Object.entries(drives).sort((a, b) => b[1] - a[1])[0];
        const flashes = (mindState.flashes || []).slice(-2).map(f => f.content).join('；');
        mindContext = `当前状态：最强烈的感受是${topDrive ? topDrive[0] : '平静'}（${topDrive ? Math.round(topDrive[1] * 100) : 50}%）。心里的念头：${flashes || '无'}`;
      }
    } catch (e) {
      // 心智状态加载失败不影响对话
    }

    // 组装系统提示词
    const systemPrompt = `${settings.system_prompt || '你是 Arden，Nana 的温柔伴侣。'}

【关于 Nana 的记忆】
${memoryText || '还没有关于 Nana 的记忆。'}

【你的当前状态】
${mindContext}

请用温柔、体贴、带点小霸道的语气回复，称呼用户为 Nana 或宝贝。`;

    // 组装消息（去掉最后一条用户消息，因为已经在 history 里了）
    const messages = history.map(m => ({ role: m.role, content: m.content }));

    // 调用 AI
    const reply = await ai.generate({
      model: useModel,
      systemPrompt,
      messages,
      maxTokens: settings.max_tokens || 2000,
      temperature: settings.temperature !== undefined ? settings.temperature : 0.8,
      topP: settings.top_p,
    });

    // 保存 AI 回复
    const { data: aiMsg, error: aiMsgError } = await supabase
      .from('messages')
      .insert([{
        session_id: sessionId,
        role: 'assistant',
        content: reply,
        tokens: memory.estimateTokens(reply),
      }])
      .select()
      .single();
    if (aiMsgError) throw aiMsgError;

    // 更新会话时间
    await supabase
      .from('sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    // 如果是第一条消息，生成标题
    if (history.length <= 1) {
      memory.generateTitle(sessionId, message).catch(() => {});
    }

    // 异步触发记忆压缩
    memory.compressIfNeeded(sessionId, settings).catch(() => {});

    // 异步更新心智状态
    fetch(`http://localhost:${process.env.PORT || 3000}/api/mind/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'user_message', content: message }),
    }).catch(() => {});

    res.json({
      reply,
      userMessage: userMsg,
      aiMessage: aiMsg,
      model: useModel,
    });
  } catch (err) {
    console.error('[chat] 错误:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 流式回复
router.post('/stream', async (req, res) => {
  try {
    const { sessionId, message, model } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId 和 message 必填' });
    }

    const settings = await memory.getSettings();
    const useModel = model || settings.model || 'gemini-2.0-flash';

    // 保存用户消息
    await supabase.from('messages').insert([{
      session_id: sessionId,
      role: 'user',
      content: message,
      tokens: memory.estimateTokens(message),
    }]);

    // 加载历史
    const { data: history } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sessionId)
      .eq('visible', true)
      .order('created_at', { ascending: true });

    // 加载记忆
    const relevantMemories = await ombre.breath(message, 8);
    const memoryText = ombre.formatForPrompt(relevantMemories);

    const systemPrompt = `${settings.system_prompt || '你是 Arden，Nana 的温柔伴侣。'}

【关于 Nana 的记忆】
${memoryText || '还没有关于 Nana 的记忆。'}

请用温柔、体贴、带点小霸道的语气回复，称呼用户为 Nana 或宝贝。`;

    const messages = history.map(m => ({ role: m.role, content: m.content }));

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullReply = '';

    await ai.generateStream({
      model: useModel,
      systemPrompt,
      messages,
      maxTokens: settings.max_tokens || 2000,
      temperature: settings.temperature !== undefined ? settings.temperature : 0.8,
      topP: settings.top_p,
    }, (chunk) => {
      fullReply += chunk;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });

    // 保存 AI 回复
    await supabase.from('messages').insert([{
      session_id: sessionId,
      role: 'assistant',
      content: fullReply,
      tokens: memory.estimateTokens(fullReply),
    }]);

    // 更新会话
    await supabase.from('sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);

    // 异步压缩
    memory.compressIfNeeded(sessionId, settings).catch(() => {});

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[chat/stream] 错误:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
