// server.js
const express = require('express');
const app = express();

// чтобы читать JSON из тела запроса
app.use(express.json());

// переменные окружения из Render
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID  = process.env.TELEGRAM_CHAT_ID;

// базовый маршрут — просто проверка, что сервер жив
app.get('/', (req, res) => {
  res.send('SecretChek report server is running');
});

// тестовый GET, который шлёт сообщение в Telegram
app.get('/test-send', async (req, res) => {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('Telegram env not set, skip send');
    return res.status(500).send('Telegram env not set');
  }

  const text = 'Тест от SecretChek: сервер жив ✅';

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
      }),
    });

    const data = await tgRes.json();
    console.log('Telegram response (test-send):', data);

    res.send('Test endpoint OK. Сообщение отправлено в Telegram.');
  } catch (err) {
    console.error('Error sending Telegram test:', err);
    res.status(500).send('Error sending Telegram test');
  }
});

// 🔥 основной маршрут приёма отчёта от приложения
app.post('/send-report', async (req, res) => {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('Telegram env not set, skip send');
    return res.status(500).json({ ok: false, error: 'Telegram env not set' });
  }

  // ждём JSON вида:
  // { shopName: "...", visitDate: "...", comment: "..." }
  const { shopName, visitDate, comment } = req.body;

  console.log('Received report body:', req.body);

  const title = shopName || 'Без названия точки';
  const date  = visitDate || 'Дата не указана';
  const comm  = comment || 'Комментарий пустой';

  const text =
    `📝 Новый отчёт SecretChek\n` +
    `🏪 Точка: ${title}\n` +
    `📅 Дата визита: ${date}\n` +
    `💬 Комментарий:\n${comm}`;

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
      }),
    });

    const data = await tgRes.json();
    console.log('Telegram response (send-report):', data);

    if (!data.ok) {
      return res.status(500).json({ ok: false, error: data });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Error sending Telegram report:', err);
    res.status(500).json({ ok: false, error: 'Telegram send failed' });
  }
});

module.exports = app;
