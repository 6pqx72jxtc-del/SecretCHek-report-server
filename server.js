// server.js (CommonJS)

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

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


// ===================================================
// 1) АГЕНТ: логин / регистрация по номеру телефона
//     POST /agent-login
//     body JSON: { phone, name?, city?, areas? }
// ===================================================
app.post("/agent-login", async (req, res) => {
  try {
    const { phone, name, city, areas } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "phone is required" });
    }

    // 1) Ищем существующего агента
    const { data: existing, error: selectError } = await supabase
      .from("agents")
      .select("*")
      .eq("phone", phone)
      .limit(1);

    if (selectError) {
      console.error("agent-login select error:", selectError);
      return res.status(400).json({ error: selectError.message });
    }

    let agent;

    if (existing && existing.length > 0) {
      // Агент уже есть
      agent = existing[0];

      // Мягко можем обновить имя/город/районы, если пришли
      const updateFields = {};
      if (name && name !== agent.name) updateFields.name = name;
      if (city && city !== agent.city) updateFields.city = city;
      if (areas && areas !== agent.areas) updateFields.areas = areas;

      if (Object.keys(updateFields).length > 0) {
        const { data: upd, error: updErr } = await supabase
          .from("agents")
          .update(updateFields)
          .eq("id", agent.id)
          .select();

        if (updErr) {
          console.error("agent-login update error:", updErr);
        } else if (upd && upd.length > 0) {
          agent = upd[0];
        }
      }
    } else {
      // 2) Создаём нового агента
      const insertObj = {
        phone,
        name: name || null,
        city: city || null,
        areas: areas || null, // строка типа "Ленинский, Октябрьский"
      };

      const { data: created, error: insertError } = await supabase
        .from("agents")
        .insert([insertObj])
        .select();

      if (insertError) {
        console.error("agent-login insert error:", insertError);
        return res.status(400).json({ error: insertError.message });
      }

      agent = created[0];
    }

    res.json({ success: true, agent });
  } catch (e) {
    console.error("agent-login fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});


// ===================================================
// 2) Профиль агента
//     GET /agent-profile?agent_id=UUID
// ===================================================
app.get("/agent-profile", async (req, res) => {
  try {
    const { agent_id } = req.query;

    if (!agent_id) {
      return res.status(400).json({ error: "agent_id is required" });
    }

    const { data: agents, error: agentErr } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agent_id)
      .limit(1);

    if (agentErr) {
      console.error("agent-profile error:", agentErr);
      return res.status(400).json({ error: agentErr.message });
    }

    if (!agents || agents.length === 0) {
      return res.status(404).json({ error: "agent_not_found" });
    }

    const agent = agents[0];

    // Кол-во заданий и отчётов просто для красивой панели
    const { data: tasks, error: tasksErr } = await supabase
      .from("tasks")
      .select("id, status")
      .eq("agent_id", agent_id);

    if (tasksErr) {
      console.error("agent-profile tasks error:", tasksErr);
    }

    const { data: reports, error: repErr } = await supabase
      .from("reports")
      .select("id")
      .eq("agent_id", agent_id);

    if (repErr) {
      console.error("agent-profile reports error:", repErr);
    }

    const tasksCount = tasks ? tasks.length : 0;
    const reportsCount = reports ? reports.length : 0;

    res.json({
      success: true,
      agent,
      stats: {
        tasksCount,
        reportsCount,
      },
    });
  } catch (e) {
    console.error("agent-profile fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});


// ===============================
// 3) СОЗДАНИЕ КОМПАНИИ
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
// 4) СОЗДАНИЕ ТОЧКИ КОМПАНИИ
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
// 5) СОЗДАНИЕ ЗАДАНИЯ (TASK)
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
// 6) ЗАДАНИЯ ДЛЯ КОНКРЕТНОГО АГЕНТА
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
// 7) ОТЧЁТ + ФАЙЛЫ (как было)
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
// Экспорт приложения (index.js делает app.listen)
// ===============================
export default app;
