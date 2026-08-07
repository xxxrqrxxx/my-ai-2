// ===== 各家 API 配置 =====
const AI_PROVIDERS = {
    // 阿里云通义千问（免费）
    'qwen-plus': {
        endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
        auth: (key) => ({ 'Authorization': `Bearer ${key}` }),
        formatRequest: (params) => ({
            model: 'qwen-plus',
            input: {
                messages: [
                    { role: 'system', content: params.systemPrompt },
                    ...params.messages
                ]
            },
            parameters: {
                max_tokens: params.maxTokens || 2000,
                temperature: params.temperature || 0.8,
                result_format: 'message'
            }
        }),
        parseResponse: (data) => {
            return data.output.choices[0].message.content;
        }
    },

    // DeepSeek（可后续添加）
    'deepseek-chat': {
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        auth: (key) => ({ 'Authorization': `Bearer ${key}` }),
        formatRequest: (params) => ({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: params.systemPrompt },
                ...params.messages
            ],
            max_tokens: params.maxTokens || 2000,
            temperature: params.temperature || 0.8
        }),
        parseResponse: (data) => data.choices[0].message.content
    }
};

// ===== 核心调用函数 =====
async function askAI({
    model = 'qwen-plus',
    systemPrompt,
    messages,
    maxTokens = 2000,
    temperature = 0.8
}) {
    const provider = AI_PROVIDERS[model];
    if (!provider) {
        throw new Error(`未知模型: ${model}，支持的模型: ${Object.keys(AI_PROVIDERS).join(', ')}`);
    }

    // 获取 API Key
    const apiKeyMap = {
        'qwen-plus': process.env.ALIBABA_API_KEY,
        'deepseek-chat': process.env.DEEPSEEK_API_KEY
    };
    const apiKey = apiKeyMap[model];
    if (!apiKey) {
        throw new Error(`缺少 ${model} 的 API Key，请在 .env 中配置`);
    }

    const requestBody = provider.formatRequest({
        systemPrompt,
        messages,
        maxTokens,
        temperature
    });

    console.log(`🤖 调用模型: ${model}`);

    const response = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...provider.auth(apiKey)
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI API 报错 (${model}): ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return provider.parseResponse(data);
}

module.exports = { askAI };