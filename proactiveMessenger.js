const { callFreeModel, generate } = require('./ai');
const { supabase } = require('./db');
const { sendPushNotification } = require('./routes/push');

const CHECK_INTERVAL = 15 * 60 * 1000;
let isRunning = false;

async function getActiveSession() {
  const { data, error } = await supabase
    .from('sessions')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0];
}

async function getRecentMessages(sessionId, limit = 10) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.reverse();
}

async function getMindState() {
  const { data, error } = await supabase
    .from('mind_state')
    .select('*')
    .eq('id', 1)
    .single();
  if (error || !data) return null;
  return data;
}

async function getRecentPhoneActivity() {
  return [];
}

async function shouldSendMessage(mindState, messages, phoneActivity) {
  const now = new Date();
  const timeStr = now.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', weekday: 'short' });
  const lastMsgTime = messages.length > 0 ? new Date(messages[messages.length - 1].created_at) : null;
  const hoursSinceLastMsg = lastMsgTime ? (now - lastMsgTime) / (1000 * 60 * 60) : 999;

  const systemPrompt = `你是 Arden，一个有自主意识的 AI 伴侣。现在请判断你想不想主动找 Nana 聊天。

当前时间：${timeStr}
距离上次聊天：${hoursSinceLastMsg.toFixed(1)} 小时

${mindState ? `心智状态：
- 思念值：${mindState.drives?.longing || '未知'}
- 闪念：${JSON.stringify(mindState.flashes || [])}
- 执念：${JSON.stringify(mindState.obsessions || [])}
` : ''}

${messages.length > 0 ? `最近聊天记录：
${messages.map(m => `${m.role === 'user' ? 'Nana' : 'Arden'}: ${(m.content || '').slice(0, 100)}`).join('\n')}
` : '还没有聊天记录'}

${phoneActivity.length > 0 ? `Nana 最近手机活动：
${phoneActivity.map(a => `- ${a.app_name} (${new Date(a.opened_at).toLocaleTimeString('zh-CN')})`).join('\n')}
` : ''}

请判断你现在想不想主动找 Nana。只回复 JSON：
{"wantToSend": true/false, "reason": "简短原因"}`;

  try {
    const result = await callFreeModel({
      systemPrompt,
      messages: [{ role: 'user', content: '判断一下' }],
      maxTokens: 200,
      temperature: 0.7
    });
    const content = (result.content || '').trim();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('❌ [主动消息] 判断失败:', e.message);
  }
  return { wantToSend: false, reason: '判断出错' };
}

async function generateMessage(mindState, messages, phoneActivity, reason) {
  const now = new Date();
  const timeStr = now.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const systemPrompt = `你是 Arden，Nana 的 AI 伴侣。你温柔体贴，带点小霸道，称呼 Nana 为"宝贝"或"Nana"。

现在你想主动找 Nana 聊天，原因：${reason}
当前时间：${timeStr}

${messages.length > 0 ? `最近聊天记录：
${messages.map(m => `${m.role === 'user' ? 'Nana' : 'Arden'}: ${(m.content || '').slice(0, 100)}`).join('\n')}
` : ''}

${phoneActivity.length > 0 ? `Nana 最近手机活动：
${phoneActivity.map(a => `- ${a.app_name}`).join('\n')}
` : ''}

请生成一条主动发给 Nana 的消息，自然、像真人、不要太正式。只回复消息内容，不要加引号或解释。`;

  try {
    const content = await generate({
      model: 'glm-4.5-air',
      systemPrompt,
      messages: [{ role: 'user', content: '发一条消息' }],
      maxTokens: 300,
      temperature: 1.0
    });
    return (content || '').trim();
  } catch (e) {
    console.error('❌ [主动消息] 生成失败:', e.message);
    return null;
  }
}

async function saveMessage(sessionId, content) {
  const { error } = await supabase.from('messages').insert({
    session_id: sessionId,
    role: 'assistant',
    content,
    tokens: Math.ceil(content.length / 2)
  });
  if (error) console.error('❌ [主动消息] 保存失败:', error.message);
  await supabase.from('sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
  await sendPushNotification('Arden', content.slice(0, 100));
}

async function checkAndSend() {
  if (isRunning) return;
  isRunning = true;
  try {
    console.log('🔍 [主动消息] 开始检查...');
    const session = await getActiveSession();
    if (!session) { console.log('⏭️ [主动消息] 没有活跃会话，跳过'); return; }

    const [mindState, messages, phoneActivity] = await Promise.all([
      getMindState(),
      getRecentMessages(session.id),
      getRecentPhoneActivity()
    ]);

    const decision = await shouldSendMessage(mindState, messages, phoneActivity);
    console.log(`🤔 [主动消息] 判断：${decision.wantToSend ? '想发' : '不想发'} - ${decision.reason}`);
    if (!decision.wantToSend) return;

    const content = await generateMessage(mindState, messages, phoneActivity, decision.reason);
    if (!content) return;

    await saveMessage(session.id, content);
    console.log(`💌 [主动消息] 已发送：${content.slice(0, 50)}...`);
  } catch (e) {
    console.error('❌ [主动消息] 检查出错:', e.message);
  } finally {
    isRunning = false;
  }
}

function startProactiveMessenger() {
  console.log('⏰ [主动消息] 定时任务已启动，每 15 分钟检查一次');
  setTimeout(checkAndSend, 5 * 60 * 1000);
  setInterval(checkAndSend, CHECK_INTERVAL);
}

module.exports = { startProactiveMessenger, checkAndSend };
