// 多模型路由 - 智谱 / 千问 / Claude中转站 / Gemini
// 保持 generate({model, systemPrompt, messages, maxTokens, temperature, topP}) 签名不变

const PROVIDERS = {
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKey: process.env.ZHIPU_API_KEY,
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.QWEN_API_KEY,
  },
  claude: {
    baseUrl: process.env.CLAUDE_BASE_URL,
    apiKey: process.env.CLAUDE_API_KEY,
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: process.env.GEMINI_API_KEY,
  },
};

// 模型 → 服务商映射
const MODEL_PROVIDER = {
  // 智谱
  'glm-4.5-air': 'zhipu',
  'glm-4.6v': 'zhipu',
  'glm-4.1v-thinking': 'zhipu',
  // 千问
  'qwen-plus': 'qwen',
  'qwen3-coder-plus': 'qwen',
  'qwen3.6-flash': 'qwen',
  // Claude
  'claude-sonnet-4-6': 'claude',
  // Gemini（备用）
  'gemini-2.5-flash': 'gemini',
  'gemini-3.5-flash': 'gemini',
};

// 后台免费模型池 - 按顺序优先，一个 429 自动切下一个
const FREE_MODELS = [
  'glm-4.5-air',       // 智谱主力，额度最多
  'qwen-plus',         // 千问主力
  'qwen3-coder-plus',  // 千问代码模型，通用也能用
  'qwen3.6-flash',     // 千问轻量
  'glm-4.6v',          // 智谱视觉模型，纯文本也能跑
  'glm-4.1v-thinking', // 智谱思考模型，最后兜底
];

// 可选模型列表（前端设置页用）
const AI_MODELS = {
  'glm-4.5-air': { name: 'GLM-4.5-Air', maxTokens: 8192 },
  'claude-sonnet-4-6': { name: 'Claude Sonnet 4.6', maxTokens: 8192 },
};

// 兼容旧模型名（全部映射到 glm-4.5-air）
const MODEL_ALIASES = {
  'gemini-3.5-flash': 'glm-4.5-air',
  'gemini-3.5-flash-lite': 'glm-4.5-air',
  'gemini-3.1-flash-lite': 'glm-4.5-air',
  'gemini-3-flash': 'glm-4.5-air',
  'gemini-3-pro': 'glm-4.5-air',
  'gemini-2.5-flash': 'glm-4.5-air',
  'gemini-2.5-pro': 'glm-4.5-air',
  'gemini-2.0-flash': 'glm-4.5-air',
  'gemini-2.0-pro': 'glm-4.5-air',
  'gemini-1.5-flash': 'glm-4.5-air',
  'gemini-1.5-pro': 'glm-4.5-air',
};

function resolveModel(model) {
  return MODEL_ALIASES[model] || model;
}

function sleep(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * 调用 OpenAI 兼容接口（内部用）
 */
async function callOpenAICompat({ provider, model, systemPrompt, messages, maxTokens, temperature, topP, stream }) {
  const config = PROVIDERS[provider];
  if (!config || !config.apiKey) {
    const err = new Error(`Provider ${provider} 未配置 API Key`);
    err.status = 401;
    throw err;
  }

  const allMessages = [];
  if (systemPrompt) {
    allMessages.push({ role: 'system', content: systemPrompt });
  }
  allMessages.push(...(messages || []));

  const body = {
    model,
    messages: allMessages,
    max_tokens: maxTokens || 4096,
    temperature: temperature !== undefined ? temperature : 0.8,
  };
  if (topP !== undefined) body.top_p = topP;
  if (stream) body.stream = true;

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${provider} API 错误 ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  if (stream) return res.body;

  const data = await res.json();
  return data.choices[0].message.content;
}

/**
 * 主力模型调用（聊天、日记等）- 保持原签名
 */
async function generate({ model, systemPrompt, messages, maxTokens, temperature, topP }) {
  const actualModel = resolveModel(model);
  const provider = MODEL_PROVIDER[actualModel];
  if (!provider) {
    throw new Error(`未知模型: ${actualModel}`);
  }

  const content = await callOpenAICompat({
    provider,
    model: actualModel,
    systemPrompt,
    messages,
    maxTokens,
    temperature,
    topP,
  });

  return content;
}

/**
 * 流式调用（暂时不用，保留兼容）
 */
async function generateStream({ model, systemPrompt, messages, maxTokens, temperature, topP }, onChunk) {
  const actualModel = resolveModel(model);
  const provider = MODEL_PROVIDER[actualModel];
  if (!provider) throw new Error(`未知模型: ${actualModel}`);

  const body = await callOpenAICompat({
    provider,
    model: actualModel,
    systemPrompt,
    messages,
    maxTokens,
    temperature,
    topP,
    stream: true,
  });

  const reader = body.getReader();
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

/**
 * 免费模型池调用（后台任务用）- 按顺序自动故障转移
 * 返回 { model, content }
 */
async function callFreeModel({ systemPrompt, messages, maxTokens, temperature, topP }) {
  const errors = [];

  for (const model of FREE_MODELS) {
    const provider = MODEL_PROVIDER[model];
    if (!provider) continue;

    try {
      const content = await callOpenAICompat({
        provider,
        model,
        systemPrompt,
        messages,
        maxTokens: maxTokens || 2048,
        temperature: temperature !== undefined ? temperature : 0.5,
        topP,
      });
      console.log(`✅ [免费模型] 使用 ${model}`);
      return { model, content };
    } catch (err) {
      errors.push(`${model}: ${err.message}`);
      // 额度用完/限流/服务端错误 → 切下一个
      if ([429, 401, 403, 404, 500, 502, 503].includes(err.status)) {
        console.log(`⚠️  [免费模型] ${model} 失败，切换下一个:`, err.message);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`所有免费模型都挂了: ${errors.join('; ')}`);
}

module.exports = {
  generate,
  generateStream,
  callFreeModel,
  AI_MODELS,
};
