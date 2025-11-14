const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Хранилище для фото/видео в оперативке (подходит для Render)
const upload = multer({ storage: multer.memoryStorage() });

// Токены Telegram из переменных окружения Render
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Тестовый маршрут
app.get('/test-send', async (req, res) => {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.log("Telegram env not set, skip send");
    return res.send("Env не настроены");
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: "Тестовое сообщение от SecretChek сервер 👌"
      }
    );

    res.send("Тест отправлен в Telegram!");
  } catch (err) {
    console.error("Ошибка:", err.response?.data || err.message);
    res.send("Ошибка отправки");
  }
});

// Основной маршрут для приёма отчёта
app.post('/send-report', upload.array('files'), async (req, res) => {
  try {
    const { title, comment } = req.body;
    const files = req.files || [];

    // 1. Отправляем текст
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: `Новый отчёт\nНазвание: ${title}\nКомментарий: ${comment}`
      }
    );

    // 2. Отправляем фото / видео
    for (const file of files) {
      const form = new FormData();
      form.append(
        file.mimetype.startsWith("video") ? 'video' : 'photo',
        file.buffer,
        file.originalname
      );
      form.append('chat_id', CHAT_ID);

      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/${file.mimetype.startsWith("video") ? 'sendVideo' : 'sendPhoto'}`,
        form,
        { headers: form.getHeaders() }
      );
    }

    res.json({ status: "OK" });

  } catch (err) {
    console.error("Ошибка отправки отчёта:", err.response?.data || err.message);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

module.exports = app;
