const express = require('express');
const webpush = require('web-push');
const { supabase } = require('../db');

const router = express.Router();

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:arden@example.com',
    PUBLIC_KEY,
    PRIVATE_KEY
  );
}

// 获取公钥
router.get('/public-key', (req, res) => {
  res.json({ publicKey: PUBLIC_KEY || '' });
});

// 保存订阅
router.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys) return res.status(400).json({ error: '缺少订阅信息' });

  // 先删旧的（单用户，只保留一个订阅）
  await supabase.from('push_subscriptions').delete().neq('id', 0);

  const { error } = await supabase.from('push_subscriptions').insert({
    endpoint,
    keys_json: keys
  });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

// 取消订阅
router.post('/unsubscribe', async (req, res) => {
  await supabase.from('push_subscriptions').delete().neq('id', 0);
  res.json({ ok: true });
});

// 发送推送（内部函数，给 proactiveMessenger 调用）
async function sendPushNotification(title, body) {
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    console.log('⚠️ [推送] VAPID 未配置，跳过');
    return;
  }

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .limit(1);

  if (error || !data || data.length === 0) {
    console.log('⚠️ [推送] 没有订阅，跳过');
    return;
  }

  const sub = data[0];
  const subscription = {
    endpoint: sub.endpoint,
    keys: sub.keys_json
  };

  const payload = JSON.stringify({ title, body });

  try {
    await webpush.sendNotification(subscription, payload);
    console.log(`🔔 [推送] 已发送：${title}`);
  } catch (e) {
    console.error('❌ [推送] 发送失败:', e.message);
    // 订阅失效了就删掉
    if (e.statusCode === 410) {
      await supabase.from('push_subscriptions').delete().eq('id', sub.id);
    }
  }
}

module.exports = router;
module.exports.sendPushNotification = sendPushNotification;
