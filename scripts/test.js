// test-sio.js
// Uso:
//   node test-sio.js <TOKEN> [CANAL]
// Ej:
//   node test-sio.js eyJhbGciOi... COMUNIDAD

const { io } = require('socket.io-client');

const TOKEN = process.argv[2] || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6OTk5OTk5OTksIm5hbWUiOiJKZXJlbWlhcyIsImxhc3RuYW1lIjoiT3loYW1idXJvIiwiZW1haWwiOiJqZXJlbWlhcy5vQG5vY2l0b2NvbnN0cnVjdG9yYS5jb20uYXIiLCJtZW1iZXJzaGlwIjp7ImlkIjo1LCJzdGFydCI6IjIwMjUtMDgtMTJUMTU6MjM6MTYuNzQ5WiIsImVuZCI6IjIwOTktMTItMzFUMDA6MDA6MDAuMDAwWiIsImNyZWF0ZWRBdCI6IjIwMjUtMDgtMTJUMTU6MjM6MTYuNzQ5WiIsInVwZGF0ZWRBdCI6IjIwMjUtMDgtMTJUMTU6MjM6MTYuNzQ5WiIsIlVzZXJNZW1iZXJzaGlwIjp7ImlkIjoyLCJtZW1iZXJzaGlwSWQiOjUsInVzZXJJZCI6OTk5OTk5OTksImNyZWF0ZWRBdCI6IjIwMjUtMDgtMTJUMTU6MjM6MTYuNzU2WiIsInVwZGF0ZWRBdCI6IjIwMjUtMDgtMTJUMTU6MjM6MTYuNzU2WiJ9fSwibW9kZXJhdG9ycyI6W3sibGV2ZWwiOiJmdWxsQWNjZXNzIiwiY2hhbm5lbFVpZCI6IjQzOTlkNDA1LWJkNDctNDAyNS1iOTQyLTcxMDRjNzJlZDhiNCIsInVzZXJJZCI6OTk5OTk5OTksImNoYW5uZWwiOnsidWlkIjoiNDM5OWQ0MDUtYmQ0Ny00MDI1LWI5NDItNzEwNGM3MmVkOGI0IiwibmFtZSI6IlJFQ0VUQVMifX0seyJsZXZlbCI6ImZ1bGxBY2Nlc3MiLCJjaGFubmVsVWlkIjoiM2U5OTU3ZWUtZWJhYy00NTlkLWE0ODMtOWNjYWVjN2I1MGQ3IiwidXNlcklkIjo5OTk5OTk5OSwiY2hhbm5lbCI6eyJ1aWQiOiIzZTk5NTdlZS1lYmFjLTQ1OWQtYTQ4My05Y2NhZWM3YjUwZDciLCJuYW1lIjoiRUpFUkNJQ0lPUyJ9fSx7ImxldmVsIjoiZnVsbEFjY2VzcyIsImNoYW5uZWxVaWQiOiIyOTMzMmViMS1iYzIxLTQ3ZTUtYjg2OC1lYjhiNmVhMjRhZjciLCJ1c2VySWQiOjk5OTk5OTk5LCJjaGFubmVsIjp7InVpZCI6IjI5MzMyZWIxLWJjMjEtNDdlNS1iODY4LWViOGI2ZWEyNGFmNyIsIm5hbWUiOiJDT01VTklEQUQifX0seyJsZXZlbCI6ImZ1bGxBY2Nlc3MiLCJjaGFubmVsVWlkIjoiMmMwNjE4MGItNjIxOS00NGM0LTg1YzYtYzcxZGM3YmU2YzA5IiwidXNlcklkIjo5OTk5OTk5OSwiY2hhbm5lbCI6eyJ1aWQiOiIyYzA2MTgwYi02MjE5LTQ0YzQtODVjNi1jNzFkYzdiZTZjMDkiLCJuYW1lIjoiTElWRSJ9fV0sInV1aWQiOiIyMDI1LTA1LTI5VDE4OjAzOjExLjMzOC0wMzowMCIsIm5vdGlmaWNhdGlvbl90b2tlbiI6ImFrbGpzaG5kamthc2hkaiIsImlhdCI6MTc1NTAxMjI0M30.OJ955GGZf674p9Sfp5_HWKVOonmUklx8HDROFTF2EJg';
const CHANNEL = (process.argv[3] || 'COMUNIDAD').toUpperCase(); // COMUNIDAD | RECETAS | EJERCICIO
const TARGET = 'http://localhost:3031';
const NAMESPACE = '/channels';

// Mapear tus enums a strings de evento si es necesario
// (Ajustá si en el cliente usan otros nombres reales)
const ChannelEvent = {
  COMUNIDAD: 'COMUNIDAD',
  RECETAS: 'RECETAS',
  EJERCICIO: 'EJERCICIOS', // ojo: en tu server aparece Channel.EJERCICIOS
};

const EVENT = ChannelEvent[CHANNEL] || ChannelEvent.COMUNIDAD;

console.log(`Conectando a ${TARGET}${NAMESPACE} - canal "${EVENT}"`);

const socket = io(`${TARGET}${NAMESPACE}`, {
  transports: ['websocket'],
  query: {
    token: TOKEN,
    lastMessageTimeStamp: Date.now(),
  },
  rejectUnauthorized: false,
});

// Log básicos
socket.on('connect', () => {
  console.log('✅ Conectado. socket.id =', socket.id);

  // Construimos un MessageChannelI
  const now = new Date();
  /** @type {import('./types').MessageChannelI | any} */
  const message = {
    message: 'hola desde test simple',
    userId: 1,                 // poné un id de usuario válido si el server lo usa
    name: 'Tester',
    lastname: 'SIO',
    createdAt: now.toISOString(), // o new Date() si el server lo parsea
    deleted: false,
    avatar: '',
    mod: [],                    // según tu store, puede ser boolean o arreglo; dejalo consistente
    reply: null,
    isPublic: true,
    level: 'USER',              // LevelUserE.USER
    metadata: '',
    type: 'Message',            // TypeMessage.Message
  };

  console.log(`🚀 Emitiendo en canal "${EVENT}"…`);
  // Con ack opcional
  socket.timeout(5000).emit(EVENT, message, (err, ack) => {
    if (err) {
      console.error('❌ Ack error:', err);
    } else {
      console.log('📨 Ack del server:', ack);
    }
  });
});

// Escuchar eco o mensajes del canal
socket.on(EVENT, (data) => {
  console.log(`📥 Evento "${EVENT}" recibido:`, data);
});

// Mute/status
socket.on('STATUS', (data) => {
  console.log('ℹ️ STATUS:', data);
});

socket.on('connect_error', (err) => {
  console.error('❌ connect_error:', err.message);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 disconnect:', reason);
  process.exit(0);
});

// Cerrar a los 5s por las dudas
setTimeout(() => {
  try { socket.close(); } catch {}
  process.exit(0);
}, 5000);
