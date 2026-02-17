
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const sqlite3 = require("sqlite3").verbose();
const cron = require("node-cron");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET || "supersecret";

const db = new sqlite3.Database("./database.sqlite");

db.run(`
CREATE TABLE IF NOT EXISTS xp_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player TEXT,
  xp INTEGER,
  collected_at TEXT
)`);

db.run(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  password TEXT
)`);

// Create default admin user
bcrypt.hash("123456", 10, (err, hash) => {
  db.get("SELECT * FROM users WHERE username='admin'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO users (username,password) VALUES (?,?)",
        ["admin", hash]);
    }
  });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username=?", [username], (err, user) => {
    if (!user) return res.status(401).json({ msg: "User not found" });

    bcrypt.compare(password, user.password, (err, match) => {
      if (!match) return res.status(401).json({ msg: "Wrong password" });

      const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: "8h" });
      res.json({ token });
    });
  });
});

function verifyToken(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(403).json({ msg: "No token" });

  jwt.verify(token, SECRET, (err) => {
    if (err) return res.status(401).json({ msg: "Invalid token" });
    next();
  });
}

async function scrapeGuild() {
  try {
    const url =
      "https://rubinothings.com.br/guild.php?guild=ShellPatrocina&world=Auroria";

    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    $("table tr").each((i, el) => {
      const tds = $(el).find("td");
      if (tds.length >= 5) {
        const player = $(tds[1]).text().trim();
        const xp = parseInt($(tds[4]).text().replace(/\D/g, "")) || 0;

        if (player && xp > 0) {
          db.run(
            "INSERT INTO xp_history (player,xp,collected_at) VALUES (?,?,?)",
            [player, xp, new Date().toISOString()]
          );
        }
      }
    });

    console.log("XP atualizado");
  } catch (err) {
    console.log("Erro scraping:", err.message);
  }
}

cron.schedule("*/10 * * * *", scrapeGuild);
scrapeGuild();

app.get("/api/xp", verifyToken, (req, res) => {
  db.all("SELECT * FROM xp_history", (err, rows) => {
    res.json(rows);
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
