const express = require('express');
const router = express.Router();
const supabase = require('../db');

// 获取某个会话的历史消息
router.get('/:sessionId', async (req, res) => {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', req.params.sessionId)
        .eq('visible', true)
        .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

module.exports = router;