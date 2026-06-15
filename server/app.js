require("dotenv").config();

const express = require("express");
const cors = require("cors");
const sessionsRouter = require("./routes/sessions");
const ordersRouter = require("./routes/orders");
const tradesRouter = require("./routes/trades");
const alertsRouter = require("./routes/alerts");
const notificationsRouter = require("./routes/notifications");
const centralRouter = require("./routes/central");
const { startKafka } = require("./kafka");

const app = express();
const port = Number(process.env.PORT || 8090);

app.use(cors());
app.use(express.json());

app.get("/api/client/health", (req, res) => {
  res.json({ ok: true, service: "trading-client-api" });
});

app.use("/api/client/sessions", sessionsRouter);
app.use("/api/client/orders", ordersRouter);
app.use("/api/client/trades", tradesRouter);
app.use("/api/client/alerts", alertsRouter);
app.use("/api/client/notifications", notificationsRouter);
app.use("/api/client/central", centralRouter);

app.use((err, req, res, next) => {
  console.error(err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    ok: false,
    message: statusCode === 500 ? "Trading client server error" : err.message,
  });
});

app.listen(port, () => {
  console.log(`Trading client API listening on http://localhost:${port}`);
});

startKafka().then((result) => {
  if (result.ok) {
    console.log("Kafka pipeline connected");
  } else {
    console.log(`Kafka pipeline not started: ${result.message}`);
  }
});
