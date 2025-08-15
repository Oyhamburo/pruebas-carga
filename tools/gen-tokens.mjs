// tools/gen-tokens.mjs
import fs from 'fs';
import path from 'path';
import jwtPkg from 'jsonwebtoken';          // CommonJS default
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const { sign } = jwtPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const N                 = Number.parseInt(process.argv[2] || '10000', 10);
const START_ID          = Number.parseInt(process.env.START_ID || '99900000', 10);
const EMAIL_DOMAIN      = process.env.EMAIL_DOMAIN || 'nocitoconstructora.com.ar';
const JWT_SECRET        = process.env.JWT_SECRET || 'MARMOTA';
const TOKEN_TTL_SEC     = Number.parseInt(process.env.TOKEN_TTL_SEC || '3600', 10);
const NOTIF_TOKEN_BASE  = process.env.NOTIF_TOKEN || 'akljshndjkashdj';
const OUT_DIR           = path.resolve(process.env.OUT_DIR || process.cwd());
const CSV_HEADER        = String(process.env.CSV_HEADER ?? 'true').toLowerCase() === 'true';
const TZ_OFFSET_MIN     = Number.parseInt(process.env.TZ_OFFSET_MIN || '-180', 10); // -03:00

const DEFAULT_CHANNELS = [
  { uid: '29332eb1-bc21-47e5-b868-eb8b6ea24af7', name: 'COMUNIDAD' },
  { uid: '3e9957ee-ebac-459d-a483-9ccaec7b50d7', name: 'EJERCICIOS' },
  { uid: '4399d405-bd47-4025-b942-7104c72ed8b4', name: 'RECETAS' },
  { uid: '2c06180b-6219-44c4-85c6-c71dc7be6c09', name: 'LIVE' },
];

// Nombres aleatorios
const NOMBRES = [
  'Jeremias','Lucia','Martina','Agustin','Camila','Mateo','Valentina','Sofia','Juan','Lautaro',
  'Victoria','Gabriel','Candela','Nicolas','Ailen','Franco','Julieta','Sebastian','Micaela','Ezequiel'
];
const APELLIDOS = [
  'Oyhamburo','Gonzalez','Perez','Rodriguez','Martinez','Lopez','Fernandez','Diaz','Romero','Alvarez',
  'Torres','Flores','Acosta','Medina','Suarez','Castro','Ortiz','Vega','Silva','Rios'
];

let CHANNELS = DEFAULT_CHANNELS;
if (process.env.CHANNELS_JSON) {
  try {
    const parsed = JSON.parse(process.env.CHANNELS_JSON);
    if (Array.isArray(parsed) && parsed.every(x => x?.uid && x?.name)) {
      CHANNELS = parsed;
    } else {
      console.warn('[gen-tokens] WARNING: CHANNELS_JSON inválido, uso DEFAULT_CHANNELS.');
    }
  } catch {
    console.warn('[gen-tokens] WARNING: CHANNELS_JSON no parseable, uso DEFAULT_CHANNELS.');
  }
}

const nowMs  = Date.now();
const nowISO = new Date(nowMs).toISOString();

const pad = (n) => String(Math.abs(n)).padStart(2, '0');
function isoWithOffset(dateMs, offsetMin = -180) {
  const tzSign = offsetMin <= 0 ? '-' : '+';
  const hh = pad(Math.floor(Math.abs(offsetMin) / 60));
  const mm = pad(Math.abs(offsetMin) % 60);
  const base = new Date(dateMs - (offsetMin * 60 * 1000)).toISOString().replace('Z', '');
  return `${base}${tzSign}${hh}:${mm}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getRandomName() {
  const nombre = NOMBRES[Math.floor(Math.random() * NOMBRES.length)];
  const apellido = APELLIDOS[Math.floor(Math.random() * APELLIDOS.length)];
  return { nombre, apellido };
}

function buildPayload(userId) {
  const createdAt = nowISO;
  const updatedAt = nowISO;
  const membershipId = 5;
  const userMembershipId = 2;

  const { nombre, apellido } = getRandomName();
  const email = `${nombre}.${apellido}.${userId}@${EMAIL_DOMAIN}`.toLowerCase();

  return {
    id: userId,
    name: nombre,
    lastname: apellido,
    email,
    membership: {
      id: membershipId,
      start: nowISO,
      end: '2099-12-31T00:00:00.000Z',
      createdAt,
      updatedAt,
      UserMembership: {
        id: userMembershipId,
        membershipId,
        userId,
        createdAt,
        updatedAt,
      },
    },
    moderators: CHANNELS.map(ch => ({
      level: 'fullAccess',
      channelUid: ch.uid,
      userId,
      channel: { uid: ch.uid, name: ch.name },
    })),
    uuid: isoWithOffset(nowMs + userId, TZ_OFFSET_MIN), // varía por usuario
    notification_token: `${NOTIF_TOKEN_BASE}-${userId}`,
    // Campos anti-colisión dentro del payload:
    nonce: crypto.randomUUID(),
  };
}

function signUniqueToken(payload) {
  // jti único: garantiza unicidad incluso si el resto coincidiera
  const jwtid = crypto.randomUUID();
  return sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL_SEC, jwtid, algorithm: 'HS256' });
}

// Validaciones
if (!Number.isFinite(N) || N <= 0) {
  console.error('[gen-tokens] ERROR: cantidad inválida. Uso: node tools/gen-tokens.mjs <N>');
  process.exit(1);
}
if (!JWT_SECRET) {
  console.warn('[gen-tokens] WARNING: JWT_SECRET vacío.');
}

const tokens = [];
const tokensFull = [];
const tokenSet = new Set();   // asegura que no haya tokens idénticos
const emailSet = new Set();   // asegura que no repitamos emails
const userIdSet = new Set();  // asegura ID únicos

for (let i = 0; i < N; i++) {
  const id = START_ID + i;

  if (userIdSet.has(id)) {
    console.error(`[gen-tokens] ERROR: userId duplicado (${id})`);
    process.exit(1);
  }
  userIdSet.add(id);

  let attempts = 0;
  while (attempts < 5) { // reintenta si hubiera choque improbable
    const payload = buildPayload(id);

    // email único
    if (emailSet.has(payload.email)) {
      attempts++;
      continue;
    }

    const token = signUniqueToken(payload);

    if (!tokenSet.has(token)) {
      tokenSet.add(token);
      emailSet.add(payload.email);
      tokens.push(token);
      tokensFull.push({ token, payload });
      break;
    }
    attempts++;
  }

  if (attempts >= 5) {
    console.error('[gen-tokens] ERROR: no se pudo generar un token único tras varios intentos.');
    process.exit(1);
  }
}

ensureDir(OUT_DIR);

const csvPath   = path.join(OUT_DIR, 'tokens.csv');
const jsonPath  = path.join(OUT_DIR, 'tokens.json');
const fullPath  = path.join(OUT_DIR, 'tokens_full.json');

const rows = CSV_HEADER ? ['token', ...tokens] : tokens;
fs.writeFileSync(csvPath, rows.join('\n'), 'utf8');
fs.writeFileSync(jsonPath, JSON.stringify(tokens, null, 2), 'utf8');
fs.writeFileSync(fullPath, JSON.stringify(tokensFull, null, 2), 'utf8');

console.log(`[gen-tokens] Generados ${N} tokens únicos (START_ID=${START_ID}).`);
console.log(`[gen-tokens] Archivos:`);
console.log(`  - ${csvPath}`);
console.log(`  - ${jsonPath}`);
console.log(`  - ${fullPath}`);
