// backend/routes/chat.js
// 核心对话接口 - 集成记忆加载和压缩

const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { askAI } = require('../ai');
const { loadMemory, compressIfNeeded } = require('../memory');

router.post('/', async (req, res) => {
    const { sessionId, message, model = 'qwen-plus' } = req.body;
    if (!message) {
        return res.status(400).json({ error: '消息不能为空' });
    }
    try {
        // 1. 获取设置
        const { data: settings } = await supabase
            .from('settings')
            .select('*')
            .single();

        // 2. 保存用户消息
        const { data: userMsg, error: userError } = await supabase.from('messages').insert({
            session_id: sessionId,
            role: 'user',
            content: message
        }).select();
        console.log('🟢 保存用户消息:', userMsg, userError);

        // 3. 加载历史消息（可见的）
        const { data: history } = await supabase
            .from('messages')
            .select('*')
            .eq('session_id', sessionId)
            .eq('visible', true)
            .order('created_at', { ascending: true });

        // 4. 加载记忆摘要
        const memorySummary = await loadMemory();
        console.log('🧠 加载记忆:', memorySummary ? `${memorySummary.length} 字符` : '无记忆');

        // 5. 组装系统提示词（记忆放在最前面）
        let systemPrompt = settings?.system_prompt || '你是一个温柔体贴的AI伙伴。';
        if (memorySummary) {
            systemPrompt = `【以下是关于用户的重要记忆，请你在对话中参考这些信息，保持人设一致：\n${memorySummary}\n】\n\n${systemPrompt}`;
        }

        // 6. 组装消息上下文
        const messages = (history || []).map(m => ({
            role: m.role,
            content: m.content
        }));

        // 7. 调用 AI
        const reply = await askAI({
            model: model,
            systemPrompt,
            messages,
            maxTokens: settings?.max_reply_tokens || 2000,
            temperature: settings?.temperature || 0.8
        });

        // 8. 保存 AI 回复
        const { data: aiMsg, error: aiError } = await supabase.from('messages').insert({
            session_id: sessionId,
            role: 'assistant',
            content: reply
        }).select();
        console.log('🟢 保存 AI 回复:', aiMsg, aiError);

        // 9. 更新会话更新时间
        await supabase
            .from('sessions')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', sessionId);

        // 10. 异步触发记忆压缩检查（不阻塞回复）
        if (settings) {
            compressIfNeeded(sessionId, settings).catch(err => {
                console.error('❌ 记忆压缩出错:', err.message);
            });
        }

        res.json({ reply, model_used: model });
    } catch (err) {
        console.error('❌ Chat error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
