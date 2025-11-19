// authAgent.js — middleware проверки JWT
import jwt from "jsonwebtoken";

export function authAgent(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Token required" });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Прикрепляем данные агента к запросу
    req.agent = decoded;
    next();
  } catch (e) {
    console.error("authAgent error:", e);
    return res.status(403).json({ error: "Invalid token" });
  }
}
