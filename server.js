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
const supabaseService = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseService) {
  console.error("❌ SUPABASE_URL или SUPABASE_SERVICE_ROLE не заданы в env");
}

const supabase = createClient(supabaseUrl, supabaseService);

// ---------------------
// Multer для файлов
// ---------------------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ===============================
// 0) Тестовый маршрут
// ===============================
app.get("/", (req, res) => {
  res.json({ ok: true, message: "SecretChek server is running" });
});

// ===============================
// X) ЛОГИН АГЕНТА ПО ТЕЛЕФОНУ
//     POST /agent-login
//     body: { phone, password }
// ===============================
app.post("/agent-login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res
        .status(400)
        .json({ error: "phone и password обязательны" });
    }

    // Ищем агента по номеру телефона
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("agent-login: supabase error:", error);
      return res.status(400).json({ error: error.message });
    }

    if (!data) {
      return res.status(401).json({ error: "Неверный телефон или пароль" });
    }

    // Временно сравниваем пароль в лоб (password === password_hash)
    if (data.password_hash !== password) {
      return res.status(401).json({ error: "Неверный телефон или пароль" });
    }

    if (data.status && data.status === "blocked") {
      return res.status(403).json({ error: "Агент заблокирован" });
    }

    // Не отдаём password_hash наружу
    const agentResponse = {
      id: data.id,
      full_name: data.full_name,
      phone: data.phone,
      email: data.email,
      city: data.city,
      rating: data.rating,
      status: data.status,
      created_at: data.created_at,
    };

    res.json({
      success: true,
      agent: agentResponse,
    });
  } catch (e) {
    console.error("agent-login fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ===============================
// 1) СОЗДАНИЕ КОМПАНИИ
// ===============================
app.post("/create-company", async (req, res) => {
  try {
    const { name, email, description, inn, phone } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const { data, error } = await supabase
      .from("companies")
      .insert([{ name, email, description, inn, phone }])
      .select();

    if (error) {
      console.error("create-company error:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, company: data[0] });
  } catch (e) {
    console.error("create-company fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ===============================
// 2) СОЗДАНИЕ ТОЧКИ КОМПАНИИ
// ===============================
app.post("/create-location", async (req, res) => {
  try {
    const { company_id, name, address, city, latitude, longitude } = req.body;

    if (!company_id || !name || !address) {
      return res
        .status(400)
        .json({ error: "company_id, name и address обязательны" });
    }

    const { data, error } = await supabase
      .from("company_locations")
      .insert([{ company_id, name, address, city, latitude, longitude }])
      .select();

    if (error) {
      console.error("create-location error:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, location: data[0] });
  } catch (e) {
    console.error("create-location fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ===============================
// 3) СОЗДАНИЕ ЗАДАНИЯ (TASK)
// ===============================
app.post("/create-task", async (req, res) => {
  try {
    const {
      company_id,
      location_id,
      agent_id,
      title,
      description,
      price_total,
      price_agent,
      deadline,
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }

    const insertObj = {
      title,
      description,
      company_id: company_id || null,
      location_id: location_id || null,
      agent_id: agent_id || null,
      price_total: price_total ?? null,
      price_agent: price_agent ?? null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      status: agent_id ? "accepted" : "new",
    };

    const { data, error } = await supabase
      .from("tasks")
      .insert([insertObj])
      .select();

    if (error) {
      console.error("create-task error:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, task: data[0] });
  } catch (e) {
    console.error("create-task fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ===============================
// 4) АГЕНТ ПОЛУЧАЕТ СВОИ ЗАДАНИЯ
//    GET /tasks-for-agent?agent_id=UUID
// ===============================
app.get("/tasks-for-agent", async (req, res) => {
  try {
    const { agent_id } = req.query;

    if (!agent_id) {
      return res.status(400).json({ error: "agent_id is required" });
    }

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("agent_id", agent_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("tasks-for-agent error:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (e) {
    console.error("tasks-for-agent fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ===============================
// 5) АГЕНТ ОТПРАВЛЯЕТ ОТЧЁТ + ФАЙЛЫ
//    POST /send-report (form-data)
//    Поля: agent_id, task_id, comment, files[]
// ===============================
app.post("/send-report", upload.array("files", 10), async (req, res) => {
  try {
    const { agent_id, task_id, comment, visit_date } = req.body;
    const files = req.files || [];

    if (!agent_id || !task_id) {
      return res
        .status(400)
        .json({ error: "agent_id и task_id обязательны для отчёта" });
    }

    // 1) создаём запись в reports
    const reportInsert = {
      agent_id,
      task_id,
      comment: comment || "",
      visit_date: visit_date ? new Date(visit_date).toISOString() : null,
    };

    const { data: reportData, error: reportError } = await supabase
      .from("reports")
      .insert([reportInsert])
      .select();

    if (reportError) {
      console.error("send-report: reportError:", reportError);
      return res.status(400).json({ error: reportError.message });
    }

    const report = reportData[0];
    const report_id = report.id;

    // 2) заливаем файлы в Supabase Storage + пишем в media_files
    for (const file of files) {
      try {
        const path = `${report_id}/${file.originalname}`;

        const { error: uploadError } = await supabase.storage
          .from("media")
          .upload(path, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });

        if (uploadError) {
          console.error("Upload error for file", file.originalname, uploadError);
          continue;
        }

        // здесь в url сохраняем path (можно потом построить публичный URL)
        const mediaRow = {
          report_id,
          file_type: file.mimetype,
          url: path,
          original_filename: file.originalname,
          size_bytes: file.size,
        };

        const { error: mediaError } = await supabase
          .from("media_files")
          .insert([mediaRow]);

        if (mediaError) {
          console.error("media_files insert error:", mediaError);
        }
      } catch (fileErr) {
        console.error("File loop error:", fileErr);
      }
    }

    res.json({
      success: true,
      message: "Отчёт сохранён",
      report_id,
      files_count: files.length,
    });
  } catch (e) {
    console.error("send-report fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ===============================
// Экспорт приложения (index.js делает app.listen)
// ===============================
export default app;
