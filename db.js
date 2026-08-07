const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;