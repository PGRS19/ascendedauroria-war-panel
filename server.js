const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const sqlite3 = require("sqlite3").verbose();
const cron = require("node-cron");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const GUILD_NAME = "ShellPatrocina";
const WORLD = "Auroria";

// ===== BANCO =====
const db = new sqlite3.Database("./database.sqlite");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      name TEXT,
      exp INTEGER,
      date TEXT
    )
  `);
});

// ===== SCRAPING COM HEADERS REAIS =====
async function fetchGuildData() {
  try {
    const response = await axios.get(
      `https://rubinothings.com.br/guild.php?guild=${GUILD_NAME}&world=${WORLD}`,
      {
        timeout: 15000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("❌ Erro scraping:", error.response?.status || error.message);
    return null;
  }
}

// ===== PROCESSAR HTML =====
async function updateGuildData() {
  const html = await fetchGuildData();
  if (!html) return;

  const $ = cheerio.load(html);
  const today = new Date().toISOString().split("T")[0];

  $("table tr").each((i, el) => {
    const columns = $(el).find("td");

    if (columns.length >= 2) {
      const name = $(columns[0]).text().trim();
      const expText = $(columns[1]).text().replace(/\./g, "").trim();
      const exp = parseInt(expText);

      if (!isNaN(exp)) {
        db.run(
          "INSERT INTO players (name, exp, date) VALUES (?, ?, ?)",
          [name, exp, today]
        );
      }
    }
  });

  console.log("✅ Dados atualizados em", new Date().toLocaleString());
}

// ===== CRON JOB (a cada 10 minutos) =====
cron.schedule("*/10 * * * *", () => {
  console.log("⏳ Atualizando guild...");
  updateGuildData();
});

// ===== ROTAS =====
app.get("/", (req, res) => {
  db.all(
    `
    SELECT 
      name,
      SUM(exp) as total_exp
    FROM players
    WHERE date = date('now')
    GROUP BY name
    ORDER BY total_exp DESC
    `,
    [],
    (err, rows) => {
      if (err) {
        res.send("Erro no banco.");
      } else {
        res.send(`
          <h1>Guild ${GUILD_NAME}</h1>
          <h2>XP Total de Hoje</h2>
          <table border="1" cellpadding="5">
            <tr>
              <th>Player</th>
              <th>XP Hoje</th>
            </tr>
            ${rows
              .map(
                (r) =>
                  `<tr><td>${r.name}</td><td>${r.total_exp}</td></tr>`
              )
              .join("")}
          </table>
        `);
      }
    }
  );
});

// ===== INICIAR =====
app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});
