// scripts/generate-users.mjs
import fs from "fs";
import path from "path";
import { faker } from "@faker-js/faker";

// (opcional) más nombres locales
// faker.setDefaultLocale("es");

const CSV_PATH = path.resolve("artillery/users.csv");
const REGISTRY_PATH = path.resolve("artillery/registry.json");

// Parámetros configurables (por env)
const TOTAL = Number(process.env.TOTAL || 10000);
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || "example.test";
const DNI_MIN = Number(process.env.DNI_MIN || 10000000);
const DNI_MAX = Number(process.env.DNI_MAX || 99999999);

// Si tu backend solo permite letras y números en domicilio (sin espacios)
const LOCATION_ALNUM_ONLY =
  (process.env.LOCATION_ALNUM_ONLY || "true").toLowerCase() === "true";

// ---------- Helpers de sanitización ----------
function sanitizeAlpha(str, { allowSpaces = false } = {}) {
  // Solo letras (incluye acentos y ñ). Con allowSpaces=true permite espacios.
  const re = allowSpaces
    ? /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g
    : /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g;

  let out = (str || "").replace(re, " ").replace(/\s+/g, " ").trim();
  out = out.slice(0, 50); // máx 50
  if (out.length < 2) out = "Anon";
  // Capitalizar simple (Primera Mayúscula resto minúscula)
  out = out
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ")
    .trim();
  return out;
}

function cleanInstagram(u) {
  return (u || "").replace(/[^a-zA-Z0-9._]/g, "").slice(0, 30);
}

function sanitizeLocation(city) {
  if (!city) return "NA";
  if (LOCATION_ALNUM_ONLY) {
    return city.replace(/[^A-Za-z0-9]/g, "");
  }
  // Si querés permitir espacios en domicilio:
  // return city.replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  return city;
}

// ---------- Generación de fechas ----------
function getAdultBirthDate() {
  const now = new Date();
  const eighteenYearsAgo = new Date(
    now.getFullYear() - 18,
    now.getMonth(),
    now.getDate()
  );
  return faker.date
    .between({ from: new Date("1970-01-01"), to: eighteenYearsAgo })
    .toISOString()
    .split("T")[0];
}

// ---------- Registry (persistencia entre corridas) ----------
function loadRegistry() {
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8"));
    }
  } catch {}
  return { usedDnis: [], usedEmails: [], usedInstagrams: [] };
}

function saveRegistry(reg) {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

// ---------- Generadores únicos ----------
function getUniqueInstagram(reg, seed) {
  let candidate = cleanInstagram(`user_${seed}`);
  let i = 0;
  while (!candidate || reg.usedInstagrams.includes(candidate)) {
    candidate = cleanInstagram(
      `user_${seed}_${faker.number.int({ min: 1, max: 999999 })}`
    );
    if (++i > 10000) throw new Error("No se pudo generar instagram único.");
  }
  reg.usedInstagrams.push(candidate);
  return candidate;
}

function getEmailForDni(reg, dni) {
  const email = `user${dni}@${EMAIL_DOMAIN}`.toLowerCase();
  if (!reg.usedEmails.includes(email)) reg.usedEmails.push(email);
  return email;
}

function randomUniqueDnis(reg, n) {
  // Genera DNIs aleatorios en [DNI_MIN, DNI_MAX], evitando los ya usados (registry + run)
  const used = new Set(reg.usedDnis || []);
  const out = new Set();

  const maxTries = Math.max(n * 50, 10000);
  let tries = 0;

  while (out.size < n && tries < maxTries) {
    const dni = faker.number.int({ min: DNI_MIN, max: DNI_MAX });
    if (!used.has(dni) && !out.has(dni)) out.add(dni);
    tries++;
  }

  if (out.size < n) {
    throw new Error(
      `No se pudieron generar ${n} DNIs únicos. Generados: ${out.size}. ` +
        `Aumentá el rango DNI_MIN/DNI_MAX o limpiá registry.json`
    );
  }

  // actualizar registry con los nuevos DNIs reservados (persistencia cross-run)
  reg.usedDnis = [...used, ...out];
  return [...out];
}

// ---------- Main ----------
function main() {
  const reg = loadRegistry();

  // 1) DNIs únicos aleatorios para todo el batch
  const dnis = randomUniqueDnis(reg, TOTAL);

  // 2) Construir usuarios
  const users = [];
  for (let i = 0; i < TOTAL; i++) {
    const dni = dnis[i];
    const email = getEmailForDni(reg, dni);
    const instagram = getUniqueInstagram(reg, dni);
    const phone = faker.number.int({ min: 1100000000, max: 1199999999 });
    const rawLocation = faker.location.city();
    const user_location = sanitizeLocation(rawLocation);

    const firstName = sanitizeAlpha(faker.person.firstName(), {
      allowSpaces: false,
    });
    const lastName = sanitizeAlpha(faker.person.lastName(), {
      allowSpaces: false,
    });

    // occupation sin comas para no romper CSV
    const occupation = faker.person.jobTitle().replace(/,/g, "");

    users.push({
      email,
      password: faker.internet.password({ length: 10 }),
      name: firstName,
      lastname: lastName,
      uuid: faker.string.uuid(),
      dni,
      phone,
      occupation,
      instagram,
      user_location,
      birth_date: getAdultBirthDate(),
      notification_token: faker.string.uuid(),
    });
  }

  // 3) CSV
  const header = Object.keys(users[0]).join(",");
  const rows = users.map((u) => Object.values(u).join(","));
  const csvContent = [header, ...rows].join("\n");

  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
  fs.writeFileSync(CSV_PATH, csvContent);

  // 4) Guardar registry (persistencia cross-run)
  saveRegistry(reg);

  console.log(`✅ users.csv generado con ${TOTAL} usuarios.`);
  console.log(`➡️ DNI_MIN=${DNI_MIN} DNI_MAX=${DNI_MAX}`);
}

main();
