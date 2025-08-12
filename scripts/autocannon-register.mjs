// scripts/autocannon-register.mjs
import fs from "fs";
import path from "path";
import autocannon from "autocannon";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = process.env.CSV_PATH
  ? path.resolve(process.env.CSV_PATH)
  : path.resolve(__dirname, "./users.csv");

const URL = process.env.TARGET || "http://54.166.171.139:3060/api/users/signup";
const CONNECTIONS = Number(process.env.CONNS || 100);

// 1) Leer y parsear el CSV
function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf-8").trim();
  if (!text) return [];
  const lines = text.split("\n");
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1);

  return rows.map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const obj = {};
    header.forEach((h, i) => (obj[h] = cols[i]));

    // Normalizar tipos según tu API (ajustá campos si hace falta)
    if (obj.dni != null) obj.dni = Number(obj.dni);
    if (obj.phone != null) obj.phone = Number(obj.phone);

    return obj;
  });
}

const users = parseCsv(CSV_PATH);
if (!users.length) {
  console.error("CSV vacío o no encontrado:", CSV_PATH);
  process.exit(1);
}

const TOTAL = Number(process.env.AMOUNT || users.length);

// 2) Configurar Autocannon correctamente
let idx = 0; // índice global para ir entregando un payload por request

const instance = autocannon({
  url: URL,
  method: "POST",
  connections: CONNECTIONS, // concurrencia (NO cantidad total)
  amount: TOTAL,            // total de requests a enviar
  headers: { "Content-Type": "application/json" },
  pipelining: 1,
  // Seteamos el cuerpo en CADA request:
  setupClient: (client) => {
    client.on("request", () => {
      if (idx < users.length) {
        const payload = users[idx++];
        client.setBody(JSON.stringify(payload));
      } else {
        // Si pediste más AMOUNT que filas, mandamos algo vacío para no crashear.
        client.setBody("{}");
      }
    });
  },
});

autocannon.track(instance, { renderProgressBar: true, renderLatencyTable: true });

// Opcional: contadores de 2xx / non-2xx
let ok = 0;
let bad = 0;
instance.on("response", (_client, statusCode) => {
  if (statusCode >= 200 && statusCode < 300) ok++;
  else bad++;
});

instance.on("done", () => {
  console.log(`Done. 2xx: ${ok} | non-2xx: ${bad}`);
});
