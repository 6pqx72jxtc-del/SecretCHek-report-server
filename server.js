// SecretChek Report Receiver (simple version)

// 1) Подтягиваем express (фреймворк для сервера)
import express from "express";

// 2) Настройки Telegram
const TELEGRAM_TOKEN = "8588541058:AAG5qCuMguytyXn74ToWTHxUaQoffRx7hFM"; // вставь сюда свой токен
const ADMIN_CHAT_ID = "1077937554";       // твой chat_id из getUpdates

// 3) Создаём приложение
const app = express();

// Позволяем читать JSON из тела запроса
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4) Тестовый GET-эндпоинт — проверка, что сервер жив
app.get("/", (req, res) => {
  res.send("SecretChek report server is running ✅");
});

// 5) Основной эндпоинт для отчёта
app.post("/api/report", async (req, res) => {
  try {
    const { shopName, visitDate, comment } = req.body;

    const textMessage = `
📋 *Новый отчёт из приложения SecretChek*

🏪 Точка: ${shopName || "-"}
📅 Дата: ${visitDate || "-"}
💬 Комментарий:
${comment || "-"}
    `;

    // Отправляем сообщение в Telegram
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: textMessage,
        parse_mode: "Markdown"
      })
    });

    res.json({ status: "ok" });
  } catch (error) {
    console.error("Telegram error:", error);
    res.status(500).json({ error: "telegram-error" });
  }
});

// 6) Запуск сервера (Railway сам подставит PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SecretChek server started on port ${PORT}`);
});
