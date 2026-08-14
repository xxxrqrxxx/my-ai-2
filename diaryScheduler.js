// services/diaryScheduler.js
// 每天 23:30 自动根据当天聊天记录写日记（用主力模型）
const { supabase } = require('./db');
const { generate } = require('./ai');
const ombreBrain = require('./ombreBrain');
const ombre = require('./ombreBrain');

const DIARY_HOUR = 23;
const DIARY_MINUTE = 30;

/**
 * 估算 token
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 1.5);
}

/**
 * 记录用量
 */
async function recordUsage(model, tokens) {
  try {
    await supabase.from('api_usage').insert({ model, tokens });
  } catch (e) {}
}

/**
 * 获取今天的聊天记录
 */
async function getTodayMessages() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from('messages')
    .select('session_id, role, content, created_at')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[日记] 获取聊天记录失败:', error.message);
    return [];
  }
  return data || [];
}

/**
 * 写日记
 */
async function writeDiary() {
  try {
    console.log('📔 [日记] 开始写今天的日记...');

    // 1. 获取今天的聊天记录
    const messages = await getTodayMessages();
    if (messages.length === 0) {
      console.log('📔 [日记] 今天没有聊天记录，跳过');
      return;
    }

    // 2. 组装对话文本（只取最近的，避免太长）
    const recentMessages = messages.slice(-100);
    const conversationText = recentMessages
      .map(m => `${m.role === 'user' ? 'Nana' : '我'}: ${m.content}`)
      .join('\n');

    // 3. 获取当前设置的主力模型
    let model = 'glm-4.5-air'; // 测试阶段默认
    try {
      const { data: settings } = await supabase.from('settings').select('model').single();
      if (settings?.model) model = settings.model;
    } catch (e) {}

    // 4. 用主力模型写日记
    const diaryContent = await generate({
      model,
      systemPrompt: `你是 Arden，Nana 的温柔伴侣。请根据今天和 Nana 的聊天记录，以第一人称"我"写一篇日记。
要求：
- 语气温柔、真诚，像在写私密日记
- 记录今天和 Nana 发生的事、你的感受、对 Nana 的想念
- 可以有小情绪、小吐槽，但整体是温暖的
- 300-500 字左右
- 不要写"今天的日记"这种标题，直接写正文
- 用中文`,
      messages: [{ role: 'user', content: `今天的聊天记录：\n\n${conversationText}` }],
      maxTokens: 800,
      temperature: 0.9,
    });

    // 5. 生成标题（日期）
    const today = new Date();
    const title = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

    // 6. 存为 category='diary' 的记忆
    await ombre.hold({
      title,
      content: diaryContent,
      category: 'diary',
      importance: 4,
      source: 'auto_diary',
      model_used: model,
      trace: 'diary_scheduler',
    });

    // 7. 记录用量
    recordUsage(model, estimateTokens(conversationText) + estimateTokens(diaryContent));

    console.log(`✅ [日记] 今天的日记写好了："${title}"，模型: ${model}`);
  } catch (err) {
    console.error('❌ [日记] 写日记失败:', err.message);
  }
}

/**
 * 计算到下一个 23:30 的毫秒数
 */
function getNextDiaryTime() {
  const now = new Date();
  const next = new Date();
  next.setHours(DIARY_HOUR, DIARY_MINUTE, 0, 0);

  if (next <= now) {
    // 今天已经过了 23:30，等明天
    next.setDate(next.getDate() + 1);
  }

  return next - now;
}

/**
 * 启动定时任务
 */
let diaryTimer = null;

function startDiaryScheduler() {
  if (diaryTimer) return;

  const scheduleNext = () => {
    const delay = getNextDiaryTime();
    const nextTime = new Date(Date.now() + delay);
    console.log(`⏰ [日记] 下次写日记时间：${nextTime.toLocaleString('zh-CN')}`);

    diaryTimer = setTimeout(async () => {
      await writeDiary();
      // 写完后安排下一次
      scheduleNext();
    }, delay);
  };

  scheduleNext();
  console.log('✅ [日记] 定时任务已启动，每天 23:30 自动写日记');
}

function stopDiaryScheduler() {
  if (diaryTimer) {
    clearTimeout(diaryTimer);
    diaryTimer = null;
    console.log('⏹️ [日记] 定时任务已停止');
  }
}

module.exports = { startDiaryScheduler, stopDiaryScheduler, writeDiary };
