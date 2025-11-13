import express from "express";
import multer from "multer";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Для загрузки файлов
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // до 25 MB

// Переменные окружения
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// Эндпоинт для получения отчёта
app.post("/report", upload.any(), async (req, res) => {
  try {
    const text = req.body.text || "Отчёт без текста";

    // 1. Отправляем текст в Telegram
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
      }),
    });

    // 2. Отправляем все файлы
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const formData = new FormData();
        formData.append("chat_id", CHAT_ID);
        formData.append("document", new Blob([file.buffer]), file.originalname);

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
          method: "POST",
          body: formData,
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
