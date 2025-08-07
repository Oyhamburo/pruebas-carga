import autocannon from "autocannon";

autocannon(
  {
    url: "http://localhost:3000/register",
    method: "POST",
    connections: 100, // concurrent connections
    duration: 10, // seconds
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: "test@example.com",
      password: "123456",
    }),
  },
  console.log
);
