import fs from "fs";
import { faker } from "@faker-js/faker";

// Evita duplicados
const usedDnis = new Set();
const usedEmails = new Set();

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

function generateUniqueDni() {
  let dni;
  do {
    dni = faker.number.int({ min: 10000000, max: 50000000 });
  } while (usedDnis.has(dni));
  usedDnis.add(dni);
  return dni;
}

function generateUniqueEmail() {
  let email;
  do {
    email = faker.internet.email().toLowerCase();
  } while (usedEmails.has(email));
  usedEmails.add(email);
  return email;
}

function generateValidInstagram() {
  return faker.internet
    .userName()
    .replace(/[^a-zA-Z0-9._]/g, "") // elimina caracteres inválidos
    .slice(0, 30);
}

const users = [];
const total = 100;

for (let i = 0; i < total; i++) {
  const dni = generateUniqueDni();
  const phone = faker.number.int({ min: 1100000000, max: 1199999999 });
  const email = generateUniqueEmail();

  users.push({
    email,
    password: faker.internet.password({ length: 10 }),
    name: faker.person.firstName(),
    lastname: faker.person.lastName(),
    uuid: faker.string.uuid(),
    dni,
    phone,
    occupation: faker.person.jobTitle(),
    instagram: generateValidInstagram(),
    user_location: faker.location.city(),
    birth_date: getAdultBirthDate(),
    notification_token: faker.string.uuid(),
  });
}

// CSV output seguro
const escape = (value: any) =>
  typeof value === "string" && value.includes(",")
    ? `"${value.replace(/"/g, '""')}"`
    : value;

const header = Object.keys(users[0]).join(",");
const rows = users.map((u) => Object.values(u).map(escape).join(","));
const csvContent = [header, ...rows].join("\n");

fs.writeFileSync("artillery/users.csv", csvContent);

console.log("✅ users.csv generado con", total, "usuarios.");
