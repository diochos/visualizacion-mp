const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();

const PUB = path.join(__dirname, "public");       // tu carpeta con index.html, js, css
const OUT_CSV = path.join(PUB, "temp.csv");
const META = path.join(PUB, "last_filename.txt");

app.use(express.static(PUB));

app.post("/api/temp", express.text({ type: "*/*", limit: "100mb" }), (req, res) => {
  const filename = req.query.filename || "archivo.xlsx";
  try {
    fs.writeFileSync(OUT_CSV, req.body, "utf8");
    fs.writeFileSync(META, filename, "utf8");
    res.json({ ok: true, saved: "temp.csv", filename });
  } catch (e) {
    res.status(500).json({ ok:false, error: e.message });
  }
});

app.get("/api/last-filename", (_req, res) => {
  try {
    const name = fs.existsSync(META) ? fs.readFileSync(META, "utf8") : "";
    res.type("text/plain").send(name);
  } catch {
    res.type("text/plain").send("");
  }
});

const port = process.env.PORT || 5500;
app.listen(port, () => console.log(`🟧 http://localhost:${port}`));
