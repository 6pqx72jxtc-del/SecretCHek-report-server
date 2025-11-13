// index.js
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// токен храним в переменной окружения TELEGRAM_BOT_TOKEN
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.REPORT_CHAT_ID; // сюда потом поставим id чата/канала

// корневой маршрут — просто проверка, что сервер жив
app.get('/', (req, res) => {
  res.send('SecretChek report server is running');
});

// простой тестовый маршрут, который присылает сообщение в Telegram
app.post('/test-send', async (req, res) => {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(500).json({ error: 'BOT_TOKEN or CHAT_ID not configured' });
    }

    const text = 'Тестовое сообщение от SecretChek сервера ✅';

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// порт для Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
