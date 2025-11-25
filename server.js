// server.js
import express from "express";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";           
import bcrypt from "bcryptjs";  
import { authAgent } from "./authAgent.js";
console.log("JWT SECRET LOADED:", process.env.JWT_SECRET ? "YES" : "NO");

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
// 4. Получение заданий агента по номеру телефона
app.get("/tasks-for-agent", async (req, res) => {
    try {
        const { phone } = req.query;

        if (!phone) {
            return res.status(400).json({ error: "phone is required" });
        }

        // 1. Ищем агента по номеру
        const { data: agent, error: agentError } = await supabase
            .from("agents")
            .select("*")
            .eq("phone", phone)
            .maybeSingle();

        if (agentError) {
            console.error("Agent lookup error:", agentError);
            return res.status(400).json({ error: agentError.message });
        }

        if (!agent) {
            return res.status(404).json({ error: "Agent not found" });
        }

        // 2. Загружаем задания для найденного agent.id
        const { data: tasks, error: taskError } = await supabase
            .from("tasks")
            .select("*")
            .eq("agent_id", agent.id)
            .order("created_at", { ascending: false });

        if (taskError) {
            console.error("Task load error:", taskError);
            return res.status(400).json({ error: taskError.message });
        }

        return res.json({ success: true, tasks });
    } catch (err) {
        console.error("Server error:", err);
        return res.status(500).json({ error: "server error" });
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

// 1) Запрос кода для регистрации
// Обрабатываем ДВА пути:
//  - /agent-register/request-code
//  - /agent-register-request   (для iOS)
app.post(
  ["/agent-register/request-code", "/agent-register-request"],
  async (req, res) => {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ error: "phone_required" });
      }

      // Проверяем, что агента с таким телефоном ещё нет
      const { data: existing, error: checkError } = await supabase
        .from("agents")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();

      if (checkError) {
        console.error("register-code check error", checkError);
        return res.status(500).json({ error: "internal_error" });
      }

      if (existing) {
        return res.status(400).json({ error: "agent_already_exists" });
      }

      // Генерируем 4-значный код
      const code = Math.floor(1000 + Math.random() * 9000).toString();

      const { error: insertError } = await supabase
        .from("phone_codes")
        .insert({
          phone,
          code,
          purpose: "register",
        });

      if (insertError) {
        console.error("register-code insert error", insertError);
        return res.status(500).json({ error: "internal_error" });
      }

      console.log("REGISTER SMS CODE for", phone, ":", code);

      res.json({ success: true });
    } catch (e) {
      console.error("agent-register request-code fatal:", e);
      res.status(500).json({ error: "internal_error" });
    }
  }
);

// 2) Подтверждение регистрации по коду
// Обрабатываем ДВА пути:
//  - /agent-register/confirm
//  - /agent-register-confirm  (для iOS)
app.post(
  ["/agent-register/confirm", "/agent-register-confirm"],
  async (req, res) => {
    try {
      const { phone, code, password, full_name, city } = req.body;

      if (!phone || !code || !password || !full_name) {
        return res.status(400).json({ error: "missing_fields" });
      }

      const { data: codes, error: codeError } = await supabase
        .from("phone_codes")
        .select("*")
        .eq("phone", phone)
        .eq("purpose", "register")
        .eq("is_used", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (codeError) {
        console.error("code lookup error:", codeError);
        return res.status(500).json({ error: "internal_error" });
      }

      const codeRow = codes?.[0];

      if (!codeRow) {
        return res.status(400).json({ error: "code_not_found" });
      }

      if (codeRow.code !== code) {
        return res.status(400).json({ error: "code_invalid" });
      }

      if (new Date(codeRow.expires_at) < new Date()) {
        return res.status(400).json({ error: "code_expired" });
      }

      const password_hash = await bcrypt.hash(password, 10);

      const { data: agentData, error: insertError } = await supabase
        .from("agents")
        .insert({
          full_name,
          phone,
          city,
          password_hash,
          status: "pending",
          rating: 5,
        })
        .select()
        .single();

      if (insertError) {
        console.error("agent-register insert error:", insertError);
        return res.status(500).json({ error: "internal_error" });
      }

      const agent = agentData;

      await supabase
        .from("phone_codes")
        .update({ is_used: true })
        .eq("id", codeRow.id);

      const tokenPayload = { agent_id: agent.id, phone: agent.phone };
      const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      res.json({
        success: true,
        token,
        agent,
      });
    } catch (e) {
      console.error("agent-register confirm fatal:", e);
      res.status(500).json({ error: "internal_error" });
    }
  }
);
// ===============================
// 6) АГЕНТ — ЛОГИН ПО ТЕЛЕФОНУ
// ===============================
// ===============================
// 6) АГЕНТ — РЕГИСТРАЦИЯ ПО ТЕЛЕФОНУ
// ===============================
app.post("/agent-register", async (req, res) => {
  try {
    const { phone, password, full_name, city } = req.body;

    if (!phone || !password) {
      return res
        .status(400)
        .json({ error: "phone и password обязательны" });
    }

    // Проверяем, нет ли уже агента с таким телефоном
    const { data: existingAgents, error: existingError } = await supabase
      .from("agents")
      .select("id")
      .eq("phone", phone)
      .limit(1);

    if (existingError) {
      console.error("agent-register check error:", existingError);
      return res.status(400).json({ error: existingError.message });
    }

    if (existingAgents && existingAgents.length > 0) {
      return res
        .status(409)
        .json({ error: "Агент с таким телефоном уже существует" });
    }

    // Хэшируем пароль
    const password_hash = await bcrypt.hash(password, 10);

    // Создаём агента
    const { data: newAgents, error: insertError } = await supabase
      .from("agents")
      .insert([
        {
          phone,
          password_hash,
          full_name: full_name || null,
          city: city || null,
          status: "pending", // можно потом перевести в 'active'
        },
      ])
      .select();

    if (insertError) {
      console.error("agent-register insert error:", insertError);
      return res.status(400).json({ error: insertError.message });
    }

    const agent = newAgents[0];

    // Возвращаем данные агента (без пароля)
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
    console.error("agent-register fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});
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

  // Генерируем JWT токен
    // Генерируем JWT-токен для агента
const tokenPayload = {
  agent_id: agent.id,
  phone: agent.phone,
};

const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
  expiresIn: "7d", // токен на 7 дней
});

// Возвращаем агенту токен + данные
res.json({
  success: true,
  token,
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
app.post("/agent-register", async (req, res) => {
  try {
    const { full_name, phone, password, city } = req.body;

    if (!phone || !password || !full_name) {
      return res.status(400).json({ error: "full_name, phone и password обязательны" });
    }

    // Проверяем, нет ли уже такого телефона
    const { data: exists, error: existsError } = await supabase
      .from("agents")
      .select("id")
      .eq("phone", phone)
      .limit(1);

    if (existsError) {
      console.error("agent-register exists check:", existsError);
      return res.status(500).json({ error: "internal_error" });
    }

    if (exists && exists.length > 0) {
      return res.status(409).json({ error: "Агент с таким телефоном уже существует" });
    }

    // Хэшируем пароль
    const password_hash = await bcrypt.hash(password, 10);

    // Создаём агента
    const { data, error } = await supabase
      .from("agents")
      .insert([
        {
          full_name,
          phone,
          password_hash,
          city,
        },
      ])
      .select();

    if (error) {
      console.error("agent-register insert:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, agent: data[0] });
  } catch (e) {
    console.error("agent-register fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});
// ===============================
// 7) ПОЛУЧЕНИЕ ПРОФИЛЯ АГЕНТА (требует токен)
// ===============================
app.get("/agent-profile", authAgent, async (req, res) => {
  try {
    const agent_id = req.agent.agent_id;

    const { data: agents, error } = await supabase
      .from("agents")
      .select("*")
      .eq("id", agent_id)
      .limit(1);

    if (error) {
      console.error("agent-profile error:", error);
      return res.status(400).json({ error: error.message });
    }

    if (!agents || agents.length === 0) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json({
      success: true,
      agent: {
        id: agents[0].id,
        full_name: agents[0].full_name,
        phone: agents[0].phone,
        city: agents[0].city,
        rating: agents[0].rating,
        status: agents[0].status,
        last_login_at: agents[0].last_login_at,
      },
    });
  } catch (e) {
    console.error("agent-profile fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});
// ===============================
// 8) ЗАДАНИЯ ДЛЯ АГЕНТА (требует токен)
// GET /agent-tasks
// ===============================
app.get("/agent-tasks", authAgent, async (req, res) => {
  try {
    const agentId = req.agent.agent_id; // из токена

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("agent-tasks error:", error);
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      tasks: data || [],
    });
  } catch (e) {
    console.error("agent-tasks fatal:", e);
    res.status(500).json({ success: false, error: "internal_error" });
  }
});
// ===============================
// 9) АГЕНТ БЕРЁТ ЗАДАНИЕ
// POST /agent-take-task
// ===============================
app.post("/agent-take-task", authAgent, async (req, res) => {
  try {
    const agentId = req.agent.agent_id;
    const { task_id } = req.body;

    if (!task_id) {
      return res.status(400).json({ success: false, error: "task_id required" });
    }

    // 1. Проверяем, что задание существует и свободно
    const { data: tasks, error: loadError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", task_id)
      .limit(1);

    if (loadError) {
      console.error("task lookup error:", loadError);
      return res.status(400).json({ success: false, error: loadError.message });
    }

    const task = tasks?.[0];

    if (!task) {
      return res.status(404).json({ success: false, error: "task_not_found" });
    }

    if (task.status !== "new") {
      return res.status(400).json({ success: false, error: "task_already_taken" });
    }

    // 2. Обновляем задание
    const { data: updated, error: updateError } = await supabase
      .from("tasks")
      .update({
        agent_id: agentId,
        status: "in_progress",
        taken_at: new Date().toISOString(),
      })
      .eq("id", task_id)
      .select()
      .single();

    if (updateError) {
      console.error("take-task update error:", updateError);
      return res.status(400).json({ success: false, error: updateError.message });
    }

    res.json({ success: true, task: updated });
  } catch (e) {
    console.error("take-task fatal:", e);
    res.status(500).json({ success: false, error: "internal_error" });
  }
});

// ===============================
// 9) АГЕНТ БЕРЁТ ЗАДАНИЕ
//    POST /agent-take-task  (требует токен)
//    body: { task_id }
// ===============================
app.post("/agent-take-task", authAgent, async (req, res) => {
  try {
    const agentId = req.agent.agent_id;    // из JWT
    const { task_id } = req.body;

    if (!task_id) {
      return res
        .status(400)
        .json({ success: false, error: "task_id_required" });
    }

    // 1) Находим задание
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", task_id)
      .maybeSingle();

    if (taskError) {
      console.error("agent-take-task select error:", taskError);
      return res
        .status(400)
        .json({ success: false, error: taskError.message });
    }

    if (!task) {
      return res
        .status(404)
        .json({ success: false, error: "task_not_found" });
    }

    /// если задание уже за этим же агентом — считаем успехом
if (task.agent_id === agentId) {
  return res.json({ success: true, task });
}

// если за другим агентом — тогда уже ошибка
if (task.agent_id && task.agent_id !== agentId) {
  return res.status(400).json({ error: "task_already_taken" });
}

    // 3) Обновляем задание: привязываем к этому агенту, меняем статус
    const { data: updated, error: updateError } = await supabase
      .from("tasks")
      .update({
        agent_id: agentId,
        status: "in_progress",        // или "accepted" — как тебе больше нравится
        updated_at: new Date().toISOString(),
      })
      .eq("id", task_id)
      .select()
      .single();

    if (updateError) {
      console.error("agent-take-task update error:", updateError);
      return res
        .status(400)
        .json({ success: false, error: updateError.message });
    }

    return res.json({
      success: true,
      task: updated,
    });
  } catch (e) {
    console.error("agent-take-task fatal:", e);
    return res
      .status(500)
      .json({ success: false, error: "internal_error" });
  }
});

// =====================================
//  AGENT SEND REPORT (POST /agent-send-report)
// =====================================
app.post("/agent-send-report", authAgent, upload.array("files", 10), async (req, res) => {
  try {
    const agent_id = req.agent.agent_id; // вытаскиваем из токена
    const { task_id, comment, visit_date } = req.body;
    const files = req.files || [];

    if (!task_id) {
      return res.status(400).json({ success: false, error: "task_id_required" });
    }

    // создаём запись отчёта
    const reportInsert = {
      agent_id,
      task_id,
      comment: comment || "",
      visit_date: visit_date ? new Date(visit_date).toISOString() : null,
    };

    const { data: reportData, error: reportError } = await supabase
      .from("reports")
      .insert([reportInsert])
      .select()
      .single();

    if (reportError) {
      console.error("insert report error:", reportError);
      return res.status(400).json({ success: false, error: reportError.message });
    }

    const report_id = reportData.id;

    // сохраняем файлы
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
          console.error("Upload err:", uploadError);
          continue;
        }

        await supabase.from("media_files").insert([
          {
            report_id,
            file_type: file.mimetype,
            url: path,
            original_filename: file.originalname,
            size_bytes: file.size,
          },
        ]);

      } catch (err) {
        console.error("file insert error:", err);
      }
    }

    return res.json({
      success: true,
      report_id,
      files_count: files.length,
    });

  } catch (err) {
    console.error("fatal report error:", err);
    return res.status(500).json({ success: false, error: "internal_error" });
  }
});

// ===============================
// 9) АГЕНТ — ОТПРАВИТЬ ОТЧЁТ
// POST /agent-send-report
// Требует токен
// ===============================
app.post("/agent-send-report", authAgent, async (req, res) => {
  try {
    const agent_id = req.agent.agent_id; // берём из JWT

    const {
      task_id,
      shop_name,
      visit_date,
      comment,
      photo_count,
      video_count,
      doc_count,
      audio_count
    } = req.body;

    if (!task_id) {
      return res.status(400).json({ error: "task_id is required" });
    }

    // Записываем в БД
    const { data, error } = await supabase
      .from("agent_reports")
      .insert([
        {
          agent_id,
          task_id,
          shop_name,
          visit_date,
          comment,
          photo_count: photo_count ?? 0,
          video_count: video_count ?? 0,
          doc_count: doc_count ?? 0,
          audio_count: audio_count ?? 0,
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("agent-send-report insert error:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json({
      success: true,
      report: data
    });

  } catch (e) {
    console.error("agent-send-report fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ===============================
// 9) ОТЧЁТ АГЕНТА
//     POST /agent-report
//     JSON: {
//       task_id?: string,
//       shop_name: string,
//       visit_date: string (ISO),
//       comment?: string,
//       photo_count: number,
//       video_count: number,
//       doc_count: number,
//       audio_count: number
//     }
// ===============================
app.post("/agent-report", authAgent, async (req, res) => {
  try {
    const agent_id = req.agent.agent_id;  // из JWT через authAgent

    const {
      task_id,
      shop_name,
      visit_date,
      comment,
      photo_count,
      video_count,
      doc_count,
      audio_count,
    } = req.body;

    if (!shop_name || !visit_date) {
      return res.status(400).json({ error: "shop_name и visit_date обязательны" });
    }

    // Нормализуем дату (на всякий случай)
    let visitISO = null;
    try {
      visitISO = new Date(visit_date).toISOString();
    } catch {
      visitISO = visit_date; // если уже ISO строка — оставим как есть
    }

    const insertObj = {
      agent_id,
      task_id: task_id || null,
      shop_name,
      visit_date: visitISO,
      comment: comment || "",
      photo_count: photo_count ?? 0,
      video_count: video_count ?? 0,
      doc_count: doc_count ?? 0,
      audio_count: audio_count ?? 0,
    };

    const { data, error } = await supabase
      .from("agent_reports")
      .insert([insertObj])
      .select()
      .single();

    if (error) {
      console.error("agent-report insert error:", error);
      return res.status(400).json({ error: error.message });
    }

    res.json({
      success: true,
      report: data,
    });
  } catch (e) {
    console.error("agent-report fatal:", e);
    res.status(500).json({ error: "internal_error" });
  }
});

// ===============================
// АГЕНТ ОТПРАВЛЯЕТ ОТЧЁТ ПО ЗАДАНИЮ
// POST /agent-send-report
// body: {
//   task_id?, shop_name, visit_date, comment,
//   photo_count, video_count, doc_count, audio_count
// }
// ===============================
app.post("/agent-send-report", authAgent, async (req, res) => {
  try {
    const agent_id = req.agent.agent_id; // из JWT

    const {
      task_id,
      shop_name,
      visit_date,
      comment,
      photo_count,
      video_count,
      doc_count,
      audio_count,
    } = req.body;

    if (!shop_name || !visit_date) {
      return res.status(400).json({ error: "shop_name и visit_date обязательны" });
    }

    const visitDateISO = new Date(visit_date).toISOString();

    const insertObj = {
      agent_id,
      task_id: task_id || null,
      shop_name,
      visit_date: visitDateISO,
      comment: comment || "",
      photo_count: photo_count ?? 0,
      video_count: video_count ?? 0,
      doc_count: doc_count ?? 0,
      audio_count: audio_count ?? 0,
    };

    const { data, error } = await supabase
      .from("reports")
      .insert([insertObj])
      .select()
      .single();

    if (error) {
      console.error("agent-send-report insert error:", error);
      return res.status(400).json({ success: false, error: error.message });
    }

    // опционально: помечаем задание как reported
    if (task_id) {
      await supabase
        .from("tasks")
        .update({ status: "reported" })
        .eq("id", task_id);
    }

    res.json({ success: true, report: data });
  } catch (e) {
    console.error("agent-send-report fatal:", e);
    res.status(500).json({ success: false, error: "internal_error" });
  }
});

// ===============================
// 5) ОТЧЁТ АГЕНТА + ФАЙЛЫ
//    POST /agent-send-report (form-data)
//    Поля: task_id, shop_name, visit_date, comment, files[]
//    Требует токен (authAgent)
// ===============================
app.post("/agent-send-report", authAgent, upload.array("files", 10), async (req, res) => {
  try {
    const agent_id = req.agent.agent_id; // из токена
    const { task_id, shop_name, visit_date, comment } = req.body;
    const files = req.files || [];

    if (!task_id) {
      return res.status(400).json({ error: "task_id is required" });
    }

    // 1) создаём запись в reports
    const reportInsert = {
      agent_id,
      task_id,
      shop_name: shop_name || null,
      comment: comment || "",
      visit_date: visit_date ? new Date(visit_date).toISOString() : null,
    };

    const { data: reportData, error: reportError } = await supabase
      .from("reports")
      .insert([reportInsert])
      .select()
      .single();

    if (reportError) {
      console.error("agent-send-report: reportError:", reportError);
      return res.status(400).json({ error: reportError.message });
    }

    const report = reportData;
    const report_id = report.id;

    // 2) загружаем файлы в Storage + пишем в media_files
    for (const file of files) {
      try {
        const path = `${report_id}/${Date.now()}-${file.originalname}`;

        const { error: uploadError } = await supabase.storage
          .from("media")               // <= имя bucket'а
          .upload(path, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });

        if (uploadError) {
          console.error("Upload error for file", file.originalname, uploadError);
          continue; // не роняем весь запрос из-за одного файла
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

    return res.json({
      success: true,
      report_id,
      files_count: files.length,
    });
  } catch (e) {
    console.error("agent-send-report fatal:", e);
    return res.status(500).json({ error: "internal_error" });
  }
});

// ===============================
// Экспорт приложения (для index.js)
// ===============================
export default app;
