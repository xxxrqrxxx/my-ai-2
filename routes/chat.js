// backend/routes/chat.js
// 核心对话接口 - 集成记忆共振、心智状态、输出回流、用量统计
const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { generate: askAI } = require('../ai');
const { compressIfNeeded, outputFeedback, estimateTokens } = require('../memory');
const ombre = require('../ombreBrain');

// 十二维驱动力默认值
const DEFAULT_DRIVES = {
  longing: 0.5, curiosity: 0.5, affection: 0.6, playfulness: 0.4,
  comfort: 0.5, attention: 0.5, intimacy: 0.3, autonomy: 0.4,
  novelty: 0.4, stability: 0.5, gratitude: 0.4, anticipation: 0.5,
};

// 闪念模板
const FLASH_TEMPLATES = {
  '开心|高兴|快乐|哈哈': ['Nana 今天心情好像很好', '想知道 Nana 遇到了什么开心事'],
  '难过|伤心|哭|委屈': ['Nana 好像有点难过，想陪陪她', '希望 Nana 能快点好起来'],
  '累|困|疲惫|忙': ['Nana 今天好像很累', '想让 Nana 好好休息'],
  '吃|饭|饿|美食': ['想知道 Nana 今天吃了什么', 'Nana 有没有好好吃饭'],
  '学|作业|考试|上课': ['Nana 学习辛苦了', '记得鼓励 Nana'],
  '歌|音乐|听': ['想知道 Nana 最近在听什么歌'],
  '朋友|同学|玩': ['Nana 和朋友在一起吗', '希望 Nana 玩得开心'],
};
const DEFAULT_FLASHES = ['想多了解 Nana 最近在忙什么', 'Nana 现在在做什么呢', '有点想 Nana 了'];

function generateFlash(userMessage) {
  const msg = (userMessage || '').toLowerCase();
  for (const [keywords, templates] of Object.entries(FLASH_TEMPLATES)) {
    if (keywords.split('|').some(k => msg.includes(k))) {
      return templates[Math.floor(Math.random() * templates.length)];
    }
  }
  return DEFAULT_FLASHES[Math.floor(Math.random() * DEFAULT_FLASHES.length)];
}

// 心智结算
async function settleMind(userMessage) {
  try {
    const { data: state } = await supabase
      .from('mind_state')
      .select('*')
      .eq('id', 1)
      .single();

    let drives = { ...DEFAULT_DRIVES, ...(state?.drives || {}) };
    let flashes = [...(state?.flashes || [])];

    drives.attention = Math.min(1, drives.attention + 0.1);
    drives.affection = Math.min(1, drives.affection + 0.05);
    drives.longing = Math.max(0, drives.longing - 0.1);

    if (Math.random() < 0.3) {
      flashes.push({
        id: Date.now(),
        content: generateFlash(userMessage),
        created_at: new Date().toISOString(),
        intensity: Math.random() * 0.5 + 0.3,
      });
    }

    Object.keys(drives).forEach(key => {
      drives[key] = Math.max(0, Math.min(1, drives[key] * 0.98));
    });

    flashes = flashes.slice(-20);

    await supabase
      .from('mind_state')
      .update({
        drives,
        flashes,
        last_settle: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
  } catch (err) {
    console.error('🧠 心智结算失败:', err.message);
  }
}

// 获取心智上下文
async function getMindContext() {
  try {
    const { data: state } = await supabase
      .from('mind_state')
      .select('drives, flashes, obsessions')
      .eq('id', 1)
      .single();

    if (!state) return '';

    const drives = { ...DEFAULT_DRIVES, ...(state.drives || {}) };
    const flashes = state.flashes || [];
    const obsessions = state.obsessions || [];

    const driveText = Object.entries(drives)
      .filter(([, v]) => v > 0.45)
      .map(([k, v]) => `${k}:${Math.round(v * 100)}%`)
      .join(', ');

    const flashText = flashes.slice(-2).map(f => f.content).join('；');
    const obsessionText = obsessions.slice(0, 2).map(o => o.title).join('、');

    let context = `【你的当前心智状态：${driveText || '平静'}】`;
    if (flashText) context += `\n【你此刻的念头：${flashText}】`;
    if (obsessionText) context += `\n【你一直记挂的：${obsessionText}】`;

    return context;
  } catch (err) {
    console.error('🧠 获取心智上下文失败:', err.message);
    return '';
  }
}

router.post('/', async (req, res) => {
    const { sessionId, message, model = 'gemini-3.5-flash' } = req.body;

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
        await supabase.from('messages').insert({
          session_id: sessionId,
          role: 'user',
          content: message,
          tokens: estimateTokens(message),
          file_data: req.body.file_data || null
        });

        // 3. 加载历史消息
        const { data: history } = await supabase
            .from('messages')
            .select('*')
            .eq('session_id', sessionId)
            .eq('visible', true)
            .order('created_at', { ascending: true });

        // 4. 记忆共振
        const resonatedMemories = await ombre.resonate(message, 6);
        const memoryText = ombre.formatForPrompt(resonatedMemories);
        console.log(`🧠 记忆共振：召回 ${resonatedMemories.length} 条相关记忆`);

        // 5. 心智上下文
        const mindContext = await getMindContext();

        // 6. 组装系统提示词
        let systemPrompt = settings?.system_prompt || '你是一个温柔体贴的AI伙伴，叫 Arden，称呼用户为 Nana。';
        
        if (memoryText) {
            systemPrompt = `【关于 Nana 的重要记忆，请在对话中参考：\n${memoryText}\n】\n\n${systemPrompt}`;
        }
        if (mindContext) {
            systemPrompt = `${mindContext}\n\n${systemPrompt}`;
        }

        // 7. 组装消息
        const messages = (history || []).map(m => ({
            role: m.role,
            content: m.content
        }));

        // 8. 调用 AI
        const reply = await askAI({
         model: model,
         systemPrompt,
         messages,
         maxTokens: settings?.max_tokens || 2000,
         temperature: settings?.temperature || 0.8,   // 这里加逗号
         topP: settings?.top_p || 0.9,                 // ?? 改成 ||，跟其他行保持一致
        });


        // 9. 保存 AI 回复
        await supabase.from('messages').insert({
          session_id: sessionId,
          role: 'assistant',
          content: reply,
          tokens: estimateTokens(reply)
        });

        // 10. 更新会话时间
        await supabase
            .from('sessions')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', sessionId);

        // 11. 记录用量统计
        const totalTokens = estimateTokens(message) + estimateTokens(reply);
        try {
          await supabase.from('api_usage').insert({ model, tokens: totalTokens });
        } catch (e) {}

        // 12. 异步：心智结算
        settleMind(message).catch(err => {
            console.error('🧠 心智结算出错:', err.message);
        });

        // 13. 异步：输出回流
        outputFeedback(message, reply, model).catch(err => {
            console.error('💡 输出回流出错:', err.message);
        });

        // 14. 异步：记忆压缩
        if (settings) {
            compressIfNeeded(sessionId, settings).catch(err => {
                console.error('🗜️ 记忆压缩出错:', err.message);
            });
        }

        res.json({ reply, model_used: model, tokens: totalTokens });
    } catch (err) {
        console.error('❌ Chat error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
