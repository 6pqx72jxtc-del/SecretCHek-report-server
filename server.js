// server.js — ПОЛНАЯ ВЕРСИЯ

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.get('/', (req, res) => {
    res.send('SecretChek report server is running.');
});

// ───────────────────────────────────────────────
// 📌 Основной маршрут для приёма отчётов
// ───────────────────────────────────────────────

app.post('/send-report', upload.array('files', 10), async (req, res) => {
    try {
        const { comment, location, time, shopId } = req.body;
        const files = req.files;

        console.log('=== Новый отчёт ===');
        console.log('Текст:', comment);
        console.log('Файлов загружено:', files.length);

        // 1) Отправляем текст в Telegram
        const textMessage =
            `📋 Новый отчёт\n` +
            `🕒 Время: ${time}\n` +
            `📍 Локация: ${location}\n` +
            `🏪 Точка: ${shopId}\n\n` +
            `💬 Комментарий: ${comment}`;

        await axios.post(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            { chat_id: CHAT_ID, text: textMessage }
        );

        // 2) Отправляем файлы (фото, видео и т.д.)
        for (const file of files) {
            console.log('Отправляю файл:', file.originalname);

            const fileStream = fs.createReadStream(file.path);
            const formData = new FormData();
            formData.append("chat_id", CHAT_ID);
            formData.append("document", fileStream, file.originalname);

            await axios.post(
                `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
                formData,
                { headers: formData.getHeaders() }
            );

            fs.unlinkSync(file.path); // удалить файл с сервера
        }

        res.json({ ok: true, message: "Report sent to Telegram" });

    } catch (err) {
        console.error('Ошибка отправки отчёта:', err.response?.data || err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

module.exports = app;
