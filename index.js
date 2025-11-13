// index.js — простой сервер для SecretChek

const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Переменные окружения для Телеграма
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Вспомогательная функция отправки сообщения в Telegram
async function sendToTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram env not set, skip send");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "Markdown"
  });
}

// Корень — просто проверка, что сервер жив
app.get("/", (req, res) => {
  res.send("SecretChek report server is running");
});

// Тестовый маршрут — именно он: /test-send
app.get("/test-send", async (req, res) => {
  try {
    await sendToTelegram("Тестовое сообщение от SecretChek report server");
    res.send("Test endpoint OK. Сообщение отправлено в Telegram (если env настроены).");
  } catch (err) {
    console.error("Error sending Telegram test:", err.message);
    res
      .status(500)
      .send("Test endpoint OK, но отправка в Telegram не удалась — смотри логи Render.");
  }
});

// (потом тут добавим /report для приёма отчётов из приложения)

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`SecretChek server listening on port ${PORT}`);
});
