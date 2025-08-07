// src/server.ts
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post("/register", (req, res) => {
  // Simulamos lógica de registro
  const { email, password } = req.body;
  console.log(`Registering user with email: ${email}`);
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password" });
  }

  // Simulación de registro exitoso
  return res.status(201).json({ message: "User registered successfully" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
