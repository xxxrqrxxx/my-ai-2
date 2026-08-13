// Gemini 模型配置（用 OpenAI 兼容格式）

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// 模型优先级列表（遇到 429 自动按顺序切换）
const MODEL_ROTATION = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

const AI_MODELS = {
  'gemini-3.5-flash': { name: 'gemini-3.5-flash', maxTokens: 8192 },
  'gemini-3.5-flash-lite': { name: 'gemini-3.5-flash-lite', maxTokens: 8192 },
  'gemini-3.1-flash-lite': { name: 'gemini-3.1-flash-lite', maxTokens: 8192 },
  // 兼容旧名，全部映射到3.5-flash
  'gemini-3-flash': { name: 'gemini-3.5-flash', maxTokens: 8192 },
  'gemini-3-pro': { name: 'gemini-3.5-flash', maxTokens: 8192 },
  'gemini-2.5-flash': { name: 'gemini-3.5-flash', maxTokens: 8192 },
  'gemini-2.5-pro': { name: 'gemini-3.5-flash', maxTokens: 8192 },
  'gemini-1.5-flash': { name: 'gemini-3.5-flash', maxTokens: 8192 },
  'gemini-1.5-pro': { name: 'gemini-3.5-flash', maxTokens: 8192 },
  'gemini-2.0-flash': { name: 'gemini-3.5-flash', maxTokens: 8192 },
  'gemini-2.0-pro': { name: 'gemini-3.5-flash', maxTokens: 8192 },
};

// 从报错信息里提取 retryDelay 秒数
function extractRetryDelay(errorMsg) {
  const match = errorMsg.match(/Please retry in ([\d.]+)s/);
  return match ? parseFloat(match[1]) : 3;
}

// 等待
function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function callGemini({ model, systemPrompt, messages, maxTokens, temperature, topP }) {
  const modelConfig = AI_MODELS[model] || AI_MODELS['gemini-3.5-flash'];

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY 未设置');
  }

  const allMessages = [];
  if (systemPrompt) {
    allMessages.push({ role: 'system', content: systemPrompt });
  }
  allMessages.push(...messages);

  const requestBody = {
    model: modelConfig.name,
    messages: allMessages,
    max_tokens: maxTokens || modelConfig.maxTokens,
    temperature: temperature !== undefined ? temperature : 0.8,
  };

  if (topP !== undefined) {
    requestBody.top_p = topP;
  }

  const response = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Gemini API 错误 ${response.status}: ${errorText}`);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return { content: data.choices[0].message.content, modelUsed: modelConfig.name };
}

async function generate({ model, systemPrompt, messages, maxTokens, temperature, topP }) {
  // 确定尝试的模型顺序：用户指定的优先，然后按轮换列表补全
  const tried = new Set();
  const tryOrder = [];

  // 先试用户指定的模型（解析出真实模型名）
  const initialModel = AI_MODELS[model]?.name || 'gemini-3.5-flash';
  tryOrder.push(initialModel);
  tried.add(initialModel);

  // 再按轮换列表补全其他模型
  for (const m of MODEL_ROTATION) {
    if (!tried.has(m)) {
      tryOrder.push(m);
      tried.add(m);
    }
  }

  let lastError = null;

  for (let i = 0; i < tryOrder.length; i++) {
    const currentModel = tryOrder[i];
    try {
      const result = await callGemini({
        model: currentModel,
        systemPrompt,
        messages,
        maxTokens,
        temperature,
        topP,
      });
      if (i > 0) {
        console.log(`🔄 自动切换模型成功: ${currentModel}`);
      }
      return result.content;
    } catch (err) {
      lastError = err;
      // 只有 429 才切换模型重试
      if (err.status === 429 && i < tryOrder.length - 1) {
        const waitSec = extractRetryDelay(err.message);
        console.log(`⚠️  ${currentModel} 额度用完(429)，等待 ${waitSec}s 后切换到 ${tryOrder[i + 1]}`);
        await sleep(Math.min(waitSec, 5)); // 最多等 5 秒，避免卡太久
        continue;
      }
      // 其他错误直接抛出
      throw err;
    }
  }

  // 所有模型都用完了
  console.error('❌ 所有 Gemini 模型今日额度均已用完');
  throw lastError;
}

async function generateStream({ model, systemPrompt, messages, maxTokens, temperature, topP }, onChunk) {
  const modelConfig = AI_MODELS[model] || AI_MODELS['gemini-3.5-flash'];

  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY 未设置');
  }

  const allMessages = [];
  if (systemPrompt) {
    allMessages.push({ role: 'system', content: systemPrompt });
  }
  allMessages.push(...messages);

  const response = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelConfig.name,
      messages: allMessages,
      max_tokens: maxTokens || modelConfig.maxTokens,
      temperature: temperature !== undefined ? temperature : 0.8,
      top_p: topP,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API 错误 ${response.status}: ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk && onChunk) onChunk(chunk);
        } catch (e) {}
      }
    }
  }
}

module.exports = {
  generate,
  generateStream,
  AI_MODELS,
};
