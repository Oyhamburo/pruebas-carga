// scripts/test-sio.js
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.findIndex(a => a === `--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const TARGET    = getArg('target', process.env.TARGET || 'http://localhost:3031');
const NAMESPACE = getArg('ns', process.env.NS || '/channels');
const CHANNEL   = (getArg('channel', process.env.CHANNEL || (args[1] || 'COMUNIDAD'))).toUpperCase();
const FILE      = getArg('file', null);
const CLIENTS   = parseInt(getArg('clients', process.env.CLIENTS || '0'), 10) || 0;
const BATCH     = parseInt(getArg('batch', process.env.BATCH || '20'), 10);
const GAP_MS    = parseInt(getArg('gap', process.env.GAP || '500'), 10);
const DURATION  = parseInt(getArg('duration', process.env.DURATION || '5000'), 10);
const MESSAGE   = getArg('message', process.env.MESSAGE || 'hola desde test-sio');

const ChannelEvent = {
  COMUNIDAD: 'COMUNIDAD',
  RECETAS: 'RECETAS',
  EJERCICIO: 'EJERCICIOS',
};
const EVENT = ChannelEvent[CHANNEL] || ChannelEvent.COMUNIDAD;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const percent = (a, b) => (b ? ((a / b) * 100).toFixed(1) : '0.0');
const p = (arr, q) => {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const i = Math.floor((q / 100) * (a.length - 1));
  return a[i];
};

const JWT_RE = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;

// Lee archivo quitando BOM
function readFileNoBOM(filePath) {
  let raw = fs.readFileSync(filePath, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // BOM
  raw = raw.replace(/^\uFEFF/, '');
  return raw;
}

// Lee tokens de CSV/JSON con saneo
function readTokens(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = readFileNoBOM(filePath);

  if (ext === '.json') {
    let data = JSON.parse(raw);
    if (data && typeof data === 'object' && data.tokens) data = data.tokens;
    if (!Array.isArray(data)) throw new Error('JSON inválido (esperado array o {tokens:[]}).');

    const tokens = data
      .map(t => String(t).trim().replace(/^\uFEFF/, ''))
      .filter(t => JWT_RE.test(t));

    return tokens;
  } else {
    // CSV (una columna)
    const lines = raw.split(/\r?\n/).map(l => l.trim().replace(/^\uFEFF/, '')).filter(Boolean);
    if (!lines.length) return [];

    const first = lines[0].toLowerCase();
    const rows = (first === 'token') ? lines.slice(1) : lines;

    const tokens = rows.filter(t => JWT_RE.test(t));
    return tokens;
  }
}

function buildMsg(i) {
  const now = new Date().toISOString();
  return {
    message: `JERE____${MESSAGE} #${i}`,
    userId: i + 1,
    name: `Tester${i}`,
    lastname: 'SIO',
    createdAt: now,
    deleted: false,
    avatar: '',
    mod: [],
    reply: null,
    isPublic: true,
    level: 'USER',
    metadata: '',
    type: 'Message',
  };
}

function connectAndEmit({ token, index = 0, logPrefix = 'single' }) {
  return new Promise((resolve) => {
    const socket = io(`${TARGET}${NAMESPACE}`, {
      transports: ['websocket'],
      query: { token, lastMessageTimeStamp: Date.now() },
      rejectUnauthorized: false,
    });

    socket.on('connect', () => {
      console.log(`✅ [${logPrefix}] conectado id=${socket.id}`);
      const t0 = Date.now();
      const msg = buildMsg(index);
      socket.timeout(5000).emit(EVENT, msg, (err, ack) => {
        if (err) {
          console.error(`❌ [${logPrefix}] ack error:`, err);
        } else {
          console.log(`📨 [${logPrefix}] ack ok (${Date.now()-t0}ms):`, ack);
        }
        resolve(socket);
      });
    });

    socket.on('connect_error', (err) => {
      console.error(`❌ [${logPrefix}] connect_error:`, err.message);
      try { socket.close(); } catch {}
      resolve(null);
    });
  });
}

// ---- MODO 1: single (token por CLI) ----
if (FILE === null && args.length && !args[0].startsWith('--')) {
  const TOKEN = args[0];
  if (!JWT_RE.test(TOKEN)) {
    console.error('❌ El token pasado por CLI no parece un JWT válido.');
    process.exit(1);
  }
  console.log(`\n[MODO SINGLE] TARGET=${TARGET}  NS=${NAMESPACE}  EVENT=${EVENT}\n`);
  (async () => {
    const s = await connectAndEmit({ token: TOKEN, index: 0, logPrefix: 'single' });
    await sleep(DURATION);
    try { s && s.close(); } catch {}
    process.exit(0);
  })();
  return;
}

// ---- MODO 2: multi (lee archivo) ----
if (!FILE) {
  console.error('❌ Pasá un token (modo single) o --file ./tokens.csv|.json (modo multi).');
  process.exit(1);
}

let TOKENS;
try {
  TOKENS = readTokens(FILE);
} catch (e) {
  console.error('❌ Error leyendo tokens:', e.message);
  process.exit(1);
}
if (!TOKENS.length) {
  console.error('❌ No se encontraron tokens válidos en', FILE);
  process.exit(1);
}

// Debug: mostrar los primeros tokens
console.log('🔎 Primeros tokens leídos:', TOKENS.slice(0, 3).map(t => t.substring(0, 20) + '...'));

const TOTAL = CLIENTS > 0 ? Math.min(CLIENTS, TOKENS.length) : TOKENS.length;
console.log(`\n[MODO MULTI] TARGET=${TARGET}  NS=${NAMESPACE}  EVENT=${EVENT}`);
console.log(`FILE=${FILE}  tokens_validos=${TOKENS.length}  CLIENTS=${TOTAL}  BATCH=${BATCH}  GAP_MS=${GAP_MS}\n`);

let created = 0, connected = 0, failed = 0, acks = 0;
const latencies = [];
const sockets = [];

function connectOne(i) {
  return new Promise((resolve) => {
    const token = TOKENS[i % TOKENS.length];
    const socket = io(`${TARGET}${NAMESPACE}`, {
      transports: ['websocket'],
      query: { token, lastMessageTimeStamp: Date.now() },
      rejectUnauthorized: false,
    });

    created++;

    socket.on('connect', () => {
      connected++;
      const t0 = Date.now();
      socket.timeout(5000).emit(EVENT, buildMsg(i), (err) => {
        if (!err) {
          acks++;
          latencies.push(Date.now() - t0);
        }
        resolve(socket);
      });
    });

    socket.on('connect_error', () => {
      failed++;
      try { socket.close(); } catch {}
      resolve(null);
    });
  });
}

(async () => {
  let idx = 0;
  while (idx < TOTAL) {
    const toCreate = Math.min(BATCH, TOTAL - idx);
    const batch = [];
    for (let k = 0; k < toCreate; k++) batch.push(connectOne(idx + k));
    const res = await Promise.all(batch);
    res.forEach(s => sockets.push(s));
    idx += toCreate;
    if (idx < TOTAL) await sleep(GAP_MS);
  }

  await sleep(DURATION);

  console.log('\n== RESUMEN ==');
  console.log(`creados:     ${created}`);
  console.log(`conectados:  ${connected} (${percent(connected, created)}%)`);
  console.log(`fallados:    ${failed} (${percent(failed, created)}%)`);
  console.log(`acks:        ${acks}`);
  if (latencies.length) {
    console.log(`lat(ms): p50=${p(latencies,50)} p95=${p(latencies,95)} p99=${p(latencies,99)} max=${p(latencies,100)}`);
  }

  sockets.forEach(s => { try { s && s.close(); } catch {} });
  process.exit(0);
})();
