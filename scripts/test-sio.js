// scripts/test-sio.js
const fs = require("fs");
const path = require("path");
const { io } = require("socket.io-client");

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.findIndex((a) => a === `--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const TARGET = getArg("target", process.env.TARGET || "http://44.201.252.74:3031");
const NAMESPACE = getArg("ns", process.env.NS || "/channels");
const CHANNEL = getArg("channel", process.env.CHANNEL || "COMUNIDAD").toUpperCase();
const FILE = getArg("file", null);

// TOTAL = tokens + clients extra
const CLIENTS = parseInt(getArg("clients", process.env.CLIENTS || "0"), 10) || 0;

const BATCH = parseInt(getArg("batch", process.env.BATCH || "500"), 10);
const GAP_MS = parseInt(getArg("gap", process.env.GAP || "5"), 10);

// NUEVO: conexiones por segundo (si >0, se usa rampa cps en lugar de batch+gap)
const CPS = parseInt(getArg("cps", process.env.CPS || "0"), 10) || 0;
// NUEVO: máximo de "in-flight" (creadas pero no conectadas/falladas)
const MAX_INFLIGHT = parseInt(getArg("maxInflight", process.env.MAX_INFLIGHT || "2000"), 10) || 2000;

// Duración total
const DURATION = parseInt(getArg("duration", process.env.DURATION || "60000"), 10);

// Mensaje base y payload extra
const MESSAGE = getArg("message", process.env.MESSAGE || "Stress test");
const KB = parseInt(getArg("kb", process.env.KB || "0"), 10) || 0; // extra kb

// Tráfico sostenido por socket
const EPS = parseInt(getArg("eps", process.env.EPS || "0"), 10) || 0; // emits/seg por socket (0 = solo al conectar)
const ACK_TIMEOUT = parseInt(getArg("ackTimeout", process.env.ACK_TIMEOUT || "2000"), 10) || 2000; // ms

// Reporte y stats
const REPORT_PATH = getArg("report", process.env.REPORT || null);
const PRINT_EVERY = parseInt(getArg("printEvery", process.env.PRINT_EVERY || "1000"), 10) || 1000;

// Resolver lote al conectar (true) o recién al primer ack (false)
const RESOLVE_ON_CONNECT = String(getArg("resolveOnConnect", "true")).toLowerCase() !== "false";

const ChannelEvent = {
  COMUNIDAD: "COMUNIDAD",
  RECETAS: "RECETAS",
  EJERCICIO: "EJERCICIOS",
};
const EVENT = ChannelEvent[CHANNEL] || ChannelEvent.COMUNIDAD;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const percent = (a, b) => (b ? ((a / b) * 100).toFixed(1) : "0.0");
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const std = (arr) => {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  const v = avg(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
};
const p = (arr, q) => {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const i = Math.floor((q / 100) * (a.length - 1));
  return a[i];
};

const JWT_RE = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;

// ---- util: leer archivo sin BOM ----
function readFileNoBOM(filePath) {
  let raw = fs.readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  raw = raw.replace(/^\uFEFF/, "");
  return raw;
}

// ---- tokens: CSV/JSON ----
function readTokens(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = readFileNoBOM(filePath);

  if (ext === ".json") {
    let data = JSON.parse(raw);
    if (data && typeof data === "object" && data.tokens) data = data.tokens;
    if (!Array.isArray(data)) throw new Error("JSON inválido (esperado array o {tokens:[]}).");
    return data
      .map((t) => String(t).trim().replace(/^\uFEFF/, ""))
      .filter((t) => JWT_RE.test(t));
  } else {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^\uFEFF/, ""))
      .filter(Boolean);
    if (!lines.length) return [];
    const first = lines[0].toLowerCase();
    const rows = first === "token" ? lines.slice(1) : lines;
    return rows.filter((t) => JWT_RE.test(t));
  }
}

// ---- payload ----
const BIG = KB > 0 ? "x".repeat(KB * 1024) : "";
function buildMsg(i) {
  const now = new Date().toISOString();
  return {
    message: `LA ROSSI____${MESSAGE} #${i}`,
    userId: i + 1,
    name: `Tester${i}`,
    lastname: "SIO",
    createdAt: now,
    deleted: false,
    avatar: "",
    mod: [],
    reply: null,
    isPublic: true,
    level: "USER",
    metadata: "",
    type: "Message",
    blob: BIG,            // payload extra para cargar red/CPU
  };
}

// ---- Métricas ----
const nowMs = () => Date.now();

const metrics = {
  start: null,
  end: null,

  created: 0,
  connected: 0,
  failedConnect: 0,

  emits: 0,
  acksOk: 0,
  ackErrors: 0,

  latencies: [],

  histogram: (() => {
    const bins = [];
    const step = 10; // ms
    const max = 5000; // 5s
    for (let t = 0; t < max; t += step) bins.push({ from: t, to: t + step, c: 0 });
    bins.push({ from: max, to: Infinity, c: 0 });
    return { step, max, bins };
  })(),

  series: {
    seconds: [],
    createdPerSec: [],
    connectedPerSec: [],
    emitsPerSec: [],
    acksPerSec: [],
    ackErrorsPerSec: [],
    failedConnectPerSec: [],
  },
  tick(sec, deltas) {
    this.series.seconds.push(sec);
    this.series.createdPerSec.push(deltas.created || 0);
    this.series.connectedPerSec.push(deltas.connected || 0);
    this.series.emitsPerSec.push(deltas.emits || 0);
    this.series.acksPerSec.push(deltas.acksOk || 0);
    this.series.ackErrorsPerSec.push(deltas.ackErrors || 0);
    this.series.failedConnectPerSec.push(deltas.failedConnect || 0);
  },
};

function recordLatency(ms) {
  metrics.latencies.push(ms);
  const h = metrics.histogram;
  if (ms >= h.max) h.bins[h.bins.length - 1].c++;
  else h.bins[Math.floor(ms / h.step)].c++;
}

function summarize() {
  const L = metrics.latencies;
  const durationMs = Math.max(1, (metrics.end || nowMs()) - metrics.start);
  const seconds = Math.max(1, Math.round(durationMs / 1000));

  return {
    target: `${TARGET}${NAMESPACE}`,
    event: EVENT,
    clientsPlanned: TOTAL,
    durationMs,
    start: new Date(metrics.start).toISOString(),
    end: new Date(metrics.end).toISOString(),
    connections: {
      created: metrics.created,
      connected: metrics.connected,
      failed: metrics.failedConnect,
      successRate: percent(metrics.connected, metrics.created),
    },
    requests: {
      emits: metrics.emits,
      acksOk: metrics.acksOk,
      ackErrors: metrics.ackErrors,
      ackSuccessRate: percent(metrics.acksOk, metrics.emits),
    },
    rates: {
      rpsAvg: (metrics.emits / seconds).toFixed(2),
      ackPerSecAvg: (metrics.acksOk / seconds).toFixed(2),
    },
    latency: L.length
      ? {
          min: Math.min(...L),
          avg: +avg(L).toFixed(2),
          stdev: +std(L).toFixed(2),
          p50: p(L, 50),
          p90: p(L, 90),
          p95: p(L, 95),
          p99: p(L, 99),
          max: Math.max(...L),
        }
      : null,
    histogram: metrics.histogram.bins
      .filter((b) => b.c > 0)
      .map((b) => ({ range: `${b.from}-${b.to === Infinity ? "inf" : b.to}ms`, count: b.c })),
    timeseries: metrics.series,
  };
}

function printProgress() {
  metrics.end = nowMs();
  const s = summarize();
  const { connections, requests, rates, latency } = s;
  const latTxt = latency
    ? `lat(ms): p50=${latency.p50} p95=${latency.p95} p99=${latency.p99} max=${latency.max}`
    : `lat(ms): n/a`;
  console.log(
    `[STATS] conns ok=${connections.connected}/${connections.created} ` +
      `fails=${connections.failed} | emits=${requests.emits} acks=${requests.acksOk} ` +
      `ackErr=${requests.ackErrors} | rpsAvg=${rates.rpsAvg} ack/sAvg=${rates.ackPerSecAvg} | ${latTxt}`
  );
}

// ---- conexión + tráfico sostenido ----
function startTrafficLoop(socket, index) {
  if (!EPS) return; // no loop
  const period = Math.max(1, Math.floor(1000 / EPS));
  const timer = setInterval(() => {
    if (!socket || !socket.connected) return;
    const msg = buildMsg(index);
    metrics.emits++;
    const t0 = nowMs();
    socket.timeout(ACK_TIMEOUT).emit(EVENT, msg, (err) => {
      if (err) metrics.ackErrors++;
      else {
        metrics.acksOk++;
        recordLatency(nowMs() - t0);
      }
    });
  }, period);
  socket.on("disconnect", () => clearInterval(timer));
}

function connectOne(i, token) {
  return new Promise((resolve) => {
    const socket = io(`${TARGET}${NAMESPACE}`, {
      transports: ["websocket"],
      query: { token, lastMessageTimeStamp: Date.now() },
      rejectUnauthorized: false,
    });

    metrics.created++;

    const finish = () => resolve(socket);

    socket.on("connect", () => {
      metrics.connected++;

      // Emit inicial (para medir first-ack si querés)
      const msg = buildMsg(i);
      metrics.emits++;
      const t0 = nowMs();
      socket.timeout(ACK_TIMEOUT).emit(EVENT, msg, (err) => {
        if (err) metrics.ackErrors++;
        else {
          metrics.acksOk++;
          recordLatency(nowMs() - t0);
        }
        if (!RESOLVE_ON_CONNECT) finish();
      });

      // Loop sostenido por socket
      startTrafficLoop(socket, i);

      if (RESOLVE_ON_CONNECT) finish();
    });

    socket.on("connect_error", () => {
      metrics.failedConnect++;
      try { socket.close(); } catch {}
      resolve(null);
    });
  });
}

// ---- MODO 1: single (token por CLI) ----
if (FILE === null && args.length && !args[0].startsWith("--")) {
  const TOKEN = args[0];
  if (!JWT_RE.test(TOKEN)) {
    console.error("❌ El token pasado por CLI no parece un JWT válido.");
    process.exit(1);
  }
  console.log(`\n[MODO SINGLE] TARGET=${TARGET}  NS=${NAMESPACE}  EVENT=${EVENT}\n`);

  (async () => {
    metrics.start = nowMs();

    const s = await connectOne(0, TOKEN);

    const interval = setInterval(printProgress, PRINT_EVERY);
    await sleep(DURATION);
    clearInterval(interval);

    metrics.end = nowMs();
    const final = summarize();

    console.log("\n== RESUMEN ==");
    console.log(`creados:     ${metrics.created}`);
    console.log(`conectados:  ${metrics.connected} (${percent(metrics.connected, metrics.created)}%)`);
    console.log(`fallados:    ${metrics.failedConnect} (${percent(metrics.failedConnect, metrics.created)}%)`);
    console.log(`emits:       ${metrics.emits}`);
    console.log(`acks ok:     ${metrics.acksOk}`);
    console.log(`ack errores: ${metrics.ackErrors}`);
    if (final.latency) {
      console.log(`lat(ms): p50=${final.latency.p50} p95=${final.latency.p95} p99=${final.latency.p99} max=${final.latency.max} avg=${final.latency.avg} ±${final.latency.stdev}`);
    }

    if (REPORT_PATH) {
      try { fs.writeFileSync(REPORT_PATH, JSON.stringify(final, null, 2)); console.log(`\n📝 Reporte guardado en ${REPORT_PATH}`); }
      catch (e) { console.error(`❌ No se pudo escribir el reporte: ${e.message}`); }
    }

    try { s && s.close(); } catch {}
    process.exit(0);
  })();
}

// ---- MODO 2: multi (lee archivo) ----
if (!FILE) {
  console.error("❌ Pasá un token (modo single) o --file ./tokens.csv|.json (modo multi).");
  process.exit(1);
}

let TOKENS;
try {
  TOKENS = readTokens(FILE);
} catch (e) {
  console.error("❌ Error leyendo tokens:", e.message);
  process.exit(1);
}
if (!TOKENS.length) {
  console.error("❌ No se encontraron tokens válidos en", FILE);
  process.exit(1);
}

console.log("🔎 Primeros tokens leídos:", TOKENS.slice(0, 3).map((t) => t.substring(0, 20) + "..."));

const EXTRA_CLIENTS = Math.max(0, CLIENTS);
const TOTAL = TOKENS.length + EXTRA_CLIENTS;

console.log(`\n[MODO MULTI] TARGET=${TARGET}  NS=${NAMESPACE}  EVENT=${EVENT}`);
console.log(`FILE=${FILE}  tokens_validos=${TOKENS.length}  extra_clients=${EXTRA_CLIENTS}  TOTAL_CLIENTS=${TOTAL}`);
console.log(`cps=${CPS}  maxInflight=${MAX_INFLIGHT}  batch=${BATCH} gap=${GAP_MS}  eps=${EPS} ackTimeout=${ACK_TIMEOUT}ms  kb=${KB}\n`);

const sockets = [];
let inflight = 0;

// series/seg
let lastSnapshot = { created: 0, connected: 0, emits: 0, acksOk: 0, ackErrors: 0, failedConnect: 0 };
let secCounter = 0;

const statsInterval = setInterval(() => {
  secCounter += 1;
  const deltas = {
    created: metrics.created - lastSnapshot.created,
    connected: metrics.connected - lastSnapshot.connected,
    emits: metrics.emits - lastSnapshot.emits,
    acksOk: metrics.acksOk - lastSnapshot.acksOk,
    ackErrors: metrics.ackErrors - lastSnapshot.ackErrors,
    failedConnect: metrics.failedConnect - lastSnapshot.failedConnect,
  };
  metrics.tick(secCounter, deltas);
  lastSnapshot = { ...metrics };
  printProgress();
}, PRINT_EVERY);

(async () => {
  metrics.start = nowMs();

  let createdTotal = 0;
  const startTime = nowMs();

  if (CPS > 0) {
    // Rampa por tasas
    const period = Math.max(10, Math.floor(1000 / CPS)); // intervalo de creación
    const rampTimer = setInterval(async () => {
      if (createdTotal >= TOTAL) return; // ya creamos todos
      // respetar inflight
      if (inflight >= MAX_INFLIGHT) return;

      const i = createdTotal;
      const token = TOKENS[i % TOKENS.length];
      inflight++;
      connectOne(i, token).then((s) => {
        inflight--;
        if (s) sockets.push(s);
      });
      createdTotal++;
    }, period);

    // Esperar fin de prueba
    await sleep(DURATION);
    clearInterval(rampTimer);
  } else {
    // Batch + gap (modo clásico)
    let idx = 0;
    while (idx < TOTAL) {
      const toCreate = Math.min(BATCH, TOTAL - idx);
      const batch = [];
      for (let k = 0; k < toCreate; k++) {
        const i = idx + k;
        const token = TOKENS[i % TOKENS.length];
        inflight++;
        batch.push(
          connectOne(i, token).then((s) => {
            inflight--;
            return s;
          })
        );
      }
      const res = await Promise.all(batch);
      res.forEach((s) => sockets.push(s));
      idx += toCreate;
      if (idx < TOTAL) await sleep(GAP_MS);
    }

    await sleep(Math.max(0, DURATION - (nowMs() - startTime)));
  }

  clearInterval(statsInterval);
  metrics.end = nowMs();

  const final = summarize();

  console.log("\n== RESUMEN ==");
  console.log(`creados:     ${metrics.created}`);
  console.log(`conectados:  ${metrics.connected} (${percent(metrics.connected, metrics.created)}%)`);
  console.log(`fallados:    ${metrics.failedConnect} (${percent(metrics.failedConnect, metrics.created)}%)`);
  console.log(`emits:       ${metrics.emits}`);
  console.log(`acks ok:     ${metrics.acksOk}`);
  console.log(`ack errores: ${metrics.ackErrors}`);
  if (final.latency) {
    console.log(
      `lat(ms): p50=${final.latency.p50} p95=${final.latency.p95} p99=${final.latency.p99} max=${final.latency.max} avg=${final.latency.avg} ±${final.latency.stdev}`
    );
  }

  if (REPORT_PATH) {
    try {
      fs.writeFileSync(REPORT_PATH, JSON.stringify(final, null, 2));
      console.log(`\n📝 Reporte guardado en ${REPORT_PATH}`);
    } catch (e) {
      console.error(`❌ No se pudo escribir el reporte: ${e.message}`);
    }
  }

  sockets.forEach((s) => { try { s && s.close(); } catch {} });
  process.exit(0);
})();
