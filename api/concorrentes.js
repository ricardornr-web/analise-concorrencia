// api/concorrentes.js
//
// Variáveis de ambiente necessárias no Vercel (Settings > Environment Variables):
//   REDIS_URL                   -> URL de conexão do Redis (ex: Upstash)
//   CONCORRENTES_WEBHOOK_SECRET -> chave que o scraper local usa pra autenticar
//
// Rotas:
//   POST /api/concorrentes          -> recebe o payload do scraper local e salva
//   GET  /api/concorrentes          -> devolve o último snapshot salvo
//   GET  /api/concorrentes?data=YYYY-MM-DD -> devolve o snapshot daquele dia

import { createClient } from "redis";

const REDIS_KEY = "concorrentes:ultimo_snapshot";
const REDIS_HISTORICO_PREFIX = "concorrentes:historico:";

let redisClient;
async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", (err) => console.error("Redis error:", err));
    await redisClient.connect();
  }
  return redisClient;
}

export default async function handler(req, res) {
  const redis = await getRedis();

  if (req.method === "POST") {
    const authHeader = req.headers["authorization"] || "";
    const expected = `Bearer ${process.env.CONCORRENTES_WEBHOOK_SECRET}`;
    if (authHeader !== expected) {
      return res.status(401).json({ error: "não autorizado" });
    }

    const payload = req.body;
    if (!payload || !payload.categorias) {
      return res.status(400).json({ error: "payload inválido" });
    }

    const dataStr = JSON.stringify(payload);
    await redis.set(REDIS_KEY, dataStr);

    const diaKey = REDIS_HISTORICO_PREFIX + payload.coletado_em.slice(0, 10);
    await redis.set(diaKey, dataStr);

    return res.status(200).json({ ok: true, subcategorias: payload.categorias.length });
  }

  if (req.method === "GET") {
    const { data } = req.query;

    if (data) {
      const raw = await redis.get(REDIS_HISTORICO_PREFIX + data);
      if (!raw) return res.status(404).json({ error: "sem dados para essa data" });
      return res.status(200).json(JSON.parse(raw));
    }

    const raw = await redis.get(REDIS_KEY);
    if (!raw) return res.status(404).json({ error: "nenhum snapshot ainda" });
    return res.status(200).json(JSON.parse(raw));
  }

  return res.status(405).json({ error: "método não suportado" });
}
