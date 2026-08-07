const express = require('express');
const router = express.Router();
const supabase = require('../db');
const { askAI } = require('../ai');  // ← 改成 askAI

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

        // 3. 加载历史消息（最近20条）
        const { data: history } = await supabase
            .from('messages')
            .select('*')
            .eq('session_id', sessionId)
            .eq('visible', true)
            .order('created_at', { ascending: true })
            .limit(20);

        // 4. 组装上下文
        const systemPrompt = settings?.system_prompt || '你是一个温柔体贴的AI伙伴。';
        const messages = (history || []).map(m => ({
            role: m.role,
            content: m.content
        }));

        // 5. 调用 AI（改为 askAI）
        const reply = await askAI({  // ← 改成 askAI
            model: model,
            systemPrompt,
            messages,
            maxTokens: settings?.max_reply_tokens || 2000,
            temperature: settings?.temperature || 0.8
        });

        // 6. 保存 AI 回复
        const { data: aiMsg, error: aiError } = await supabase.from('messages').insert({
            session_id: sessionId,
            role: 'assistant',
            content: reply
        }).select();
        console.log('🟢 保存 AI 回复:', aiMsg, aiError);

        // 7. 更新会话更新时间
        await supabase
            .from('sessions')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', sessionId);

        res.json({ reply, model_used: model });

    } catch (err) {
        console.error('❌ Chat error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;