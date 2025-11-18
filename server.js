// server.js
import express from "express";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const app = express();

// ---------------------
// Базовые middlewares
// ---------------------
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------------------
// Подключение Supabase
// ---------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnon = process.env.SUPABASE_ANON_KEY;
const supabaseService = process.env.SUPABASE_SERVICE_ROLE;

// мы используем service-role ключ (серверный, с полным доступом)
const supabase = createClient(supabaseUrl, supabaseService);

// ======================================
// 1) СОЗДАНИЕ КОМПАНИИ
// ======================================
app.post("/create-company", async (req, res) => {
  const { name, email, description } = req.body;

  const { data, error } = await supabase
    .from("companies")
    .insert([{ name, email, description }])
    .select();

  if (error) {
    return res.status(400).json({ error });
  }

  res.json({ success: true, company: data[0] });
});

// ======================================
// 2) СОЗДАНИЕ ТОЧКИ КОМПАНИИ
// ======================================
app.post("/create-location", async (req, res) => {
  const { company_id, address } = req.body;

  const { data, error } = await supabase
    .from("company_locations")
    .insert([{ company_id, address }])
    .select();

  if (error) {
    return res.status(400).json({ error });
  }

  res.json({ success: true, location: data[0] });
});

// ======================================
// 3) КЛИЕНТ СОЗДАЁТ ЗАДАНИЕ
// ======================================
app.post("/create-task", async (req, res) => {
  const { company_id, location_id, description } = req.body;

  const { data, error } = await supabase
    .from("tasks")
    .insert([{ company_id, location_id, description }])
    .select();

  if (error) {
    return res.status(400).json({ error });
  }

  res.json({ success: true, task: data[0] });
});

// ======================================
// 4) АГЕНТ ПОЛУЧАЕТ СПИСОК ЗАДАНИЙ (пока без фильтра по району)
// ======================================
app.get("/tasks-for-agent", async (req, res) => {
  const { area } = req.query; // на будущее, пока не используем

  const { data, error } = await supabase
    .from("tasks")
    .select("*");

  if (error) {
    return res.status(400).json({ error });
  }

  res.json(data);
});

// ======================================
// 5) АГЕНТ ОТПРАВЛЯЕТ ОТЧЁТ + ФАЙЛЫ
// ======================================
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Принимаем multipart/form-data с полем "files"
app.post("/send-report", upload.array("files", 10), async (req, res) => {
  try {
    const { agent_id, task_id, comment } = req.body;
    const files = req.files || [];

    // 1) сохраняем сам отчёт
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .insert([{ agent_id, task_id, comment }])
      .select();

    if (reportError) {
      return res.status(400).json({ error: reportError });
    }

    const report_id = report[0].id;

    // 2) сохраняем файлы в Storage + в media_files
    for (const file of files) {
      // файл в storage
      const path = `${report_id}/${file.originalname}`;

      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(path, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue; // пока не валим весь запрос
      }

      // запись в media_files
      await supabase
        .from("media_files")
        .insert([
          {
            report_id,
            file_name: file.originalname,
            type: file.mimetype,
            path,
          },
        ]);
    }

    res.json({ success: true, message: "Отчёт сохранён" });
  } catch (e) {
    console.error("send-report error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ======================================
// Экспорт приложения (без app.listen)
// ======================================
export default app;
