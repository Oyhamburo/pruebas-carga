#!/usr/bin/env node
import autocannon from 'autocannon';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.findIndex(a => a === `--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const HOST = getArg('host', process.env.HOST || 'http://44.201.252.74:3031');
const CHANNEL = getArg('channel', process.env.CHANNEL || 'COMUNIDAD');
const CANT = parseInt(getArg('cant', process.env.CANT || '500'), 10);
const DURATION = parseInt(getArg('duration', process.env.DURATION || '30'), 10);
const CONNECTIONS = parseInt(getArg('connections', process.env.CONNECTIONS || '1000'), 10);
const PIPELINING = parseInt(getArg('pipelining', process.env.PIPELINING || '1'), 10);
const REPORT = getArg('report', process.env.REPORT || null);

// Auth: --token o --tokensFile (csv/json con “token” por línea o {tokens:[...]} )
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTk5MDAxMzMsIm5hbWUiOiJKdWFuIiwibGFzdG5hbWUiOiJWZWdhIiwiZW1haWwiOiJqdWFuLnZlZ2EuOTk5MDAxMzNAbm9jaXRvY29uc3RydWN0b3JhLmNvbS5hciIsIm1lbWJlcnNoaXAiOnsiaWQiOjUsInN0YXJ0IjoiMjAyNS0wOC0xNVQxMzowOTowMy41NTJaIiwiZW5kIjoiMjA5OS0xMi0zMVQwMDowMDowMC4wMDBaIiwiY3JlYXRlZEF0IjoiMjAyNS0wOC0xNVQxMzowOTowMy41NTJaIiwidXBkYXRlZEF0IjoiMjAyNS0wOC0xNVQxMzowOTowMy41NTJaIiwiVXNlck1lbWJlcnNoaXAiOnsiaWQiOjIsIm1lbWJlcnNoaXBJZCI6NSwidXNlcklkIjo5OTkwMDEzMywiY3JlYXRlZEF0IjoiMjAyNS0wOC0xNVQxMzowOTowMy41NTJaIiwidXBkYXRlZEF0IjoiMjAyNS0wOC0xNVQxMzowOTowMy41NTJaIn19LCJtb2RlcmF0b3JzIjpbeyJsZXZlbCI6ImZ1bGxBY2Nlc3MiLCJjaGFubmVsVWlkIjoiMjkzMzJlYjEtYmMyMS00N2U1LWI4NjgtZWI4YjZlYTI0YWY3IiwidXNlcklkIjo5OTkwMDEzMywiY2hhbm5lbCI6eyJ1aWQiOiIyOTMzMmViMS1iYzIxLTQ3ZTUtYjg2OC1lYjhiNmVhMjRhZjciLCJuYW1lIjoiQ09NVU5JREFEIn19LHsibGV2ZWwiOiJmdWxsQWNjZXNzIiwiY2hhbm5lbFVpZCI6IjNlOTk1N2VlLWViYWMtNDU5ZC1hNDgzLTljY2FlYzdiNTBkNyIsInVzZXJJZCI6OTk5MDAxMzMsImNoYW5uZWwiOnsidWlkIjoiM2U5OTU3ZWUtZWJhYy00NTlkLWE0ODMtOWNjYWVjN2I1MGQ3IiwibmFtZSI6IkVKRVJDSUNJT1MifX0seyJsZXZlbCI6ImZ1bGxBY2Nlc3MiLCJjaGFubmVsVWlkIjoiNDM5OWQ0MDUtYmQ0Ny00MDI1LWI5NDItNzEwNGM3MmVkOGI0IiwidXNlcklkIjo5OTkwMDEzMywiY2hhbm5lbCI6eyJ1aWQiOiI0Mzk5ZDQwNS1iZDQ3LTQwMjUtYjk0Mi03MTA0YzcyZWQ4YjQiLCJuYW1lIjoiUkVDRVRBUyJ9fSx7ImxldmVsIjoiZnVsbEFjY2VzcyIsImNoYW5uZWxVaWQiOiIyYzA2MTgwYi02MjE5LTQ0YzQtODVjNi1jNzFkYzdiZTZjMDkiLCJ1c2VySWQiOjk5OTAwMTMzLCJjaGFubmVsIjp7InVpZCI6IjJjMDYxODBiLTYyMTktNDRjNC04NWM2LWM3MWRjN2JlNmMwOSIsIm5hbWUiOiJMSVZFIn19XSwidXVpZCI6IjIwMjUtMDgtMTZUMTk6NTQ6MDMuNjg1LTAzOjAwIiwibm90aWZpY2F0aW9uX3Rva2VuIjoiYWtsanNobmRqa2FzaGRqLTk5OTAwMTMzIiwibm9uY2UiOiI3NDFiNWVmYy00NDY4LTRhZWYtOWY2Yy0xYmE0ZmYzNTgxNjMiLCJpYXQiOjE3NTUyNjMzNDMsImV4cCI6MTc1NTI2Njk0MywianRpIjoiOGM4MDgzMzctYTgyOS00NDFiLTkzNjctMTNmYWI0YzE2NGZmIn0.Vei60U9eymtR3W2MH-pL2615ztC8A9a8qao88IN4V7E"
const TOKENS_FILE = getArg('tokensFile', process.env.TOKENS_FILE || null);

// Ramping opcional: --ramp "30,60,90" (sube conexiones cada step en % del valor base)
const RAMP = (getArg('ramp', null) || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .map(x => parseInt(x, 10))
  .filter(Number.isFinite);

function readTokensFile(fp) {
  if (!fp) return [];
  const raw = fs.readFileSync(fp, 'utf8').replace(/^\uFEFF/, '');
  const ext = path.extname(fp).toLowerCase();
  const jwtRe = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
  if (ext === '.json') {
    let data = JSON.parse(raw);
    if (data && typeof data === 'object' && Array.isArray(data.tokens)) data = data.tokens;
    if (!Array.isArray(data)) throw new Error('JSON inválido: se esperaba array o {tokens:[...]}');
    return data.map(t => String(t).trim()).filter(t => jwtRe.test(t));
  } else {
    // CSV/Texto: una columna "token" o una por línea
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const head = lines[0].toLowerCase();
    const rows = head === 'token' ? lines.slice(1) : lines;
    return rows.map(t => t.trim()).filter(t => jwtRe.test(t));
  }
}

const TOKENS = TOKEN ? [TOKEN] : (TOKENS_FILE ? readTokensFile(TOKENS_FILE) : []);
let tokenIdx = 0;

const urlPath = `/api/chats/getChatFromChannelToday/${CHANNEL}/${CANT}`;
const url = `${HOST}${urlPath}`;

function runOnce({ connections }) {
  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url,
      method: 'GET',
      connections,
      duration: DURATION,
      pipelining: PIPELINING,
      headers: {
        accept: 'application/json',
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      setupClient: (client) => {
        // rota tokens por conexión si viene tokensFile
        if (!TOKEN && TOKENS.length) {
          const t = TOKENS[tokenIdx++ % TOKENS.length];
          client.setHeaders({
            accept: 'application/json',
            authorization: `Bearer ${t}`,
          });
        }
      },
      // métricas finas
      includeLatencyPercentiles: true,
      renderProgressBar: true,
      renderResultsTable: true,
    });

    autocannon.track(instance, { renderProgressBar: true, renderResultsTable: true });

    instance.on('done', (result) => {
      if (REPORT) {
        try {
          fs.writeFileSync(REPORT, JSON.stringify(result, null, 2));
          console.log(`\n📝 Reporte guardado en ${REPORT}`);
        } catch (e) {
          console.error('No se pudo guardar el reporte:', e.message);
        }
      }
      resolve(result);
    });

    instance.on('error', reject);
  });
}

(async () => {
  try {
    if (RAMP.length) {
      console.log(`RAMP: base=${CONNECTIONS} → steps=%[${RAMP.join(', ')}]`);
      for (const pct of RAMP) {
        const conns = Math.max(1, Math.floor((pct / 100) * CONNECTIONS));
        console.log(`\n== Step: ${pct}% (${conns} conexiones) ==`);
        await runOnce({ connections: conns });
      }
    } else {
      await runOnce({ connections: CONNECTIONS });
    }
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
