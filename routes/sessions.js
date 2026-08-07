const express = require('express');
const router = express.Router();
const supabase = require('../db');

// 获取所有会话
router.get('/', async (req, res) => {
    const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('updated_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// 创建新会话
router.post('/', async (req, res) => {
    const { name } = req.body;
    const { data, error } = await supabase
        .from('sessions')
        .insert({ name: name || '新对话' })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// 重命名会话
router.patch('/:id', async (req, res) => {
    const { name } = req.body;
    const { data, error } = await supabase
        .from('sessions')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// 删除会话
router.delete('/:id', async (req, res) => {
    const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

module.exports = router;