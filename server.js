// server.js
import express from "express";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";           // пока не используем, но можно оставить
import bcrypt from "bcryptjs";            // ИМПОРТ ПАРОЛЕЙ – ТУТ, ВВЕРХУ

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
// 4) ЗАДАНИЯ ДЛЯ КОНКРЕТНОГО АГЕНТА
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
// 5) ОТЧЁТ АГЕНТА + ФАЙЛЫ
//    POST /send-report (form-data)
//    Поля: agent_id, task_id, comment, visit_date, files[]
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
// 6) АГЕНТ — РЕГИСТРАЦИЯ ПО ТЕЛЕФОНУ
//    POST /agent-register
//    body: { phone, password, full_name?, city? }
// ===============================
app.post("/agent-register", async (req, res) => {
  try {
    const { phone, password, full_name, city } = req.body;

    if (!phone || !password) {
      return res
        .status(400)
        .json({ error: "phone и password обязательны" });
    }

    // 1) Проверяем, нет ли уже такого телефона
    const { data: existing, error: checkError } = await supabase
      .from("agents")
      .select("id")
      .eq("phone", phone)
      .limit(1);

    if (checkError) {
      console.error("agent-register check error:", checkError);
      return res.status(400).json({ error: checkError.message });
    }

    if (existing && existing.length > 0) {
      return res
        .status(409)
        .json({ error: "Агент с таким телефоном уже существует" });
    }

    // 2) Хэшируем пароль
    const password_hash = await bcrypt.hash(password, 10);

    // 3) Создаём запись в таблице agents
    const { data, error: insertError } = await supabase
      .from("agents")
      .insert([
        {
          phone,
          password_hash,
          full_name: full_name || null,
          city: city || null,
          status: "pending", // только зарегистрировался
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error("agent-register insert error:", insertError);
      return res.status(400).json({ error: insertError.message });
    }

    // 4) Возвращаем агента без password_hash
    res.json({
      success: true,
      agent: {
        id: data.id,
        phone: data.phone,
        full_name: data.full_name,
        city: data.city,
        rating: data.rating,
        status: data.status,
      },
    });
  } catch (e) {
    console.error("agent-register fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});
// ===============================
// 6) АГЕНТ — ЛОГИН ПО ТЕЛЕФОНУ
// ===============================
app.post("/agent-login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: "phone и password обязательны" });
    }

    const { data: agents, error } = await supabase
      .from("agents")
      .select("*")
      .eq("phone", phone)
      .limit(1);

    if (error) {
      console.error("agent-login error:", error);
      return res.status(400).json({ error: error.message });
    }

    if (!agents || agents.length === 0) {
      return res.status(404).json({ error: "Агент не найден" });
    }

    const agent = agents[0];

    const ok = await bcrypt.compare(password, agent.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Неверный пароль" });
    }

    await supabase
      .from("agents")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", agent.id);

    res.json({
      success: true,
      agent: {
        id: agent.id,
        full_name: agent.full_name,
        phone: agent.phone,
        city: agent.city,
        rating: agent.rating,
        status: agent.status,
      },
    });
  } catch (e) {
    console.error("agent-login fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ===============================
// Экспорт приложения (для index.js)
// ===============================
export default app;
