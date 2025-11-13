// SecretChek Report Receiver Server
// Author: Roman x ChatGPT
// Purpose: Receives reports from iOS app and forwards to Telegram + amoCRM

import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";

// -------------------------------
// 🔐 Your Telegram Bot Token
// -------------------------------
const TELEGRAM_TOKEN = "8588541058:AAG5qCuMguytyXn74ToWTHxUaQoffRx7hFM";

// The chat ID (your personal ID from getUpdates result)
const ADMIN_CHAT_ID = "1077937554"; 

// -------------------------------
// ⚙️  Express + file upload setup
// -------------------------------
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: "uploads/" });

// -------------------------------
// 📩 Receive Report from iOS App
// -------------------------------
app.post("/api/report", upload.any(), async (req, res) => {
  try {
    const { shopName, visitDate, comment } = req.body;

    const textMessage = `
📋 *Новый отчёт из приложения SecretChek*

🏪 Точка: ${shopName}
📅 Дата: ${visitDate}
💬 Комментарий:
${comment}
    `;

    // 1. Send text message
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: textMessage,
        parse_mode: "Markdown"
      })
    });

    // 2. Send all attached files
    for (const file of req.files) {
      const fileStream = fs.createReadStream(file.path);

      const formData = new FormData();
      formData.append("chat_id", ADMIN_CHAT_ID);
      formData.append("document", fileStream, file.originalname);

      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`,
        { method: "POST", body: formData }
      );

      fs.unlinkSync(file.path); // delete temp file
    }

    res.json({ status: "ok" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "server-error" });
  }
});

// -------------------------------
// 🚀 Start server
// -------------------------------
app.listen(3000, () => console.log("Server started on port 3000"));
