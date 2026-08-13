// Gemini 模型配置（用 OpenAI 兼容格式）
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

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

async function generate({ model, systemPrompt, messages, maxTokens, temperature, topP }) {
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

  try {
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
      throw new Error(`Gemini API 错误 ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err) {
    console.error('[ai.generate] 错误:', err.message);
    throw err;
  }
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
