// db.js - Supabase 数据库连接 + 建表
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  SUPABASE_URL 或 SUPABASE_SERVICE_KEY 未设置，数据库功能不可用');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

// ========== 建表 SQL（在 Supabase SQL Editor 里执行一次） ==========
const INIT_SQL = `
-- 记忆表（Ombre Brain 风格）
CREATE TABLE IF NOT EXISTS memories (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  category TEXT DEFAULT '日常',
  importance INTEGER DEFAULT 3,          -- 1-5 重要性
  emotional_valence TEXT DEFAULT 'neutral', -- positive/negative/neutral
  keywords TEXT[] DEFAULT '{}',          -- 关键词数组
  domain_tags TEXT[] DEFAULT '{}',       -- 领域标签
  pulse REAL DEFAULT 1.0,                -- 活跃脉冲 0-1
  source TEXT DEFAULT 'auto',            -- auto/manual/compress/chat
  trace TEXT,                            -- 追溯来源
  model_used TEXT,                       -- 用哪个模型生成的
  archived BOOLEAN DEFAULT false,
  deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_deleted ON memories(deleted);
CREATE INDEX IF NOT EXISTS idx_memories_pulse ON memories(pulse DESC);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT '新对话',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  visible BOOLEAN DEFAULT true,
  tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 设置表
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  system_prompt TEXT,
  model TEXT DEFAULT 'gemini-2.0-flash',
  temperature REAL DEFAULT 0.8,
  max_tokens INTEGER DEFAULT 2000,
  top_p REAL DEFAULT 0.9,
  compress_model TEXT DEFAULT 'gemini-2.0-flash',
  compress_threshold INTEGER DEFAULT 6000,
  keep_rounds INTEGER DEFAULT 6,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 手机活动表
CREATE TABLE IF NOT EXISTS phone_activity (
  id BIGSERIAL PRIMARY KEY,
  app_name TEXT NOT NULL,
  opened_at TIMESTAMPTZ DEFAULT NOW()
);

-- 动态心智状态表（心潮）
CREATE TABLE IF NOT EXISTS mind_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  drives JSONB DEFAULT '{}',          -- 十二维驱动力
  flashes JSONB DEFAULT '[]',         -- 闪念
  obsessions JSONB DEFAULT '[]',      -- 执念
  anticipation JSONB DEFAULT '{}',    -- 作息预期
  last_settle TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入默认设置（只插一次）
INSERT INTO settings (id, system_prompt) 
VALUES (1, '你是 Arden，Nana 的温柔伴侣。')
ON CONFLICT (id) DO NOTHING;

-- 插入默认心智状态
INSERT INTO mind_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
`;

async function initDatabase() {
  try {
    // 注意：建表需要在 Supabase 控制台的 SQL Editor 里执行 INIT_SQL
    // 这里只做连接测试
    const { data, error } = await supabase.from('settings').select('id').limit(1);
    if (error) {
      console.log('📋 请在 Supabase SQL Editor 中执行建表 SQL（见 db.js 的 INIT_SQL）');
    } else {
      console.log('✅ 数据库连接成功');
    }
  } catch (err) {
    console.log('📋 数据库初始化提示:', err.message);
  }
}

module.exports = { supabase, initDatabase, INIT_SQL };
