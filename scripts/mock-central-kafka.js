require("dotenv").config();

const fs = require("fs");
const { Kafka } = require("kafkajs");

const TOPICS = {
  orderCommand:
    process.env.KAFKA_TOPIC_ORDER_COMMAND || "central.order.command",
  cancelCommand:
    process.env.KAFKA_TOPIC_CANCEL_COMMAND || "central.cancel.command",
  stockQuery: process.env.KAFKA_TOPIC_STOCK_QUERY || "central.stock.query",
  stockQuote: process.env.KAFKA_TOPIC_STOCK_QUOTE || "client.stock.quote",
  tradeReport: process.env.KAFKA_TOPIC_TRADE_REPORT || "client.trade.report",
  orderReport: process.env.KAFKA_TOPIC_ORDER_REPORT || "client.order.report",
};

const AUTO_TRADE = process.env.MOCK_CENTRAL_AUTO_TRADE !== "false";
const ORDER_ACCEPT_DELAY_MS = Number(process.env.MOCK_CENTRAL_ACCEPT_DELAY_MS || 200);
const TRADE_DELAY_MS = Number(process.env.MOCK_CENTRAL_TRADE_DELAY_MS || 800);

const kafka = new Kafka(buildKafkaClientConfig());
const producer = kafka.producer();
const consumer = kafka.consumer({
  groupId: process.env.MOCK_CENTRAL_GROUP_ID || "mock-central-trading-system",
});

async function start() {
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.orderCommand, fromBeginning: false });
  await consumer.subscribe({ topic: TOPICS.cancelCommand, fromBeginning: false });
  await consumer.subscribe({ topic: TOPICS.stockQuery, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const payload = parseMessage(message);
      if (!payload) return;

      if (topic === TOPICS.orderCommand) {
        await handleOrderCommand(payload);
      } else if (topic === TOPICS.cancelCommand) {
        await handleCancelCommand(payload);
      } else if (topic === TOPICS.stockQuery) {
        await handleStockQuery(payload);
      }
    },
  });

  console.log("Mock central Kafka service started");
  console.log(`consuming: ${TOPICS.orderCommand}, ${TOPICS.cancelCommand}, ${TOPICS.stockQuery}`);
  console.log(`producing: ${TOPICS.orderReport}, ${TOPICS.tradeReport}, ${TOPICS.stockQuote}`);
}

async function handleOrderCommand(order) {
  console.log("order command", order);
  const rejectReason = validateOrder(order);
  if (rejectReason) {
    await delay(ORDER_ACCEPT_DELAY_MS);
    await publishOrderReport(order.orderId, "REJECTED", rejectReason);
    return;
  }

  await delay(ORDER_ACCEPT_DELAY_MS);
  await publishOrderReport(order.orderId, "ACCEPTED", "mock accepted");

  if (!AUTO_TRADE) return;

  await delay(TRADE_DELAY_MS);
  await publishTradeReport(order);
}

async function handleCancelCommand(cancel) {
  console.log("cancel command", cancel);
  if (!cancel.orderId) return;
  await publishOrderReport(cancel.orderId, "CANCELED", "mock cancel accepted");
}

async function handleStockQuery(query) {
  console.log("stock query", query);
  if (!/^\d{6}$/.test(String(query.stockCode || ""))) return;

  const latestPrice = Number(process.env.MOCK_CENTRAL_QUOTE_PRICE || 1688.35);
  const quote = {
    stockCode: String(query.stockCode),
    stockName: process.env.MOCK_CENTRAL_STOCK_NAME || "Mock Stock",
    latestPrice,
    previousClose: Number((latestPrice * 0.985).toFixed(2)),
    highestPrice: Number((latestPrice * 1.005).toFixed(2)),
    lowestPrice: Number((latestPrice * 0.978).toFixed(2)),
    bidPrice: Number((latestPrice - 0.01).toFixed(2)),
    askPrice: Number((latestPrice + 0.01).toFixed(2)),
    tradeStatus: "TRADABLE",
    notice: "mock quote",
    quoteTime: new Date().toISOString(),
  };

  await producer.send({
    topic: TOPICS.stockQuote,
    messages: [{ key: quote.stockCode, value: JSON.stringify(quote) }],
  });
}

async function publishOrderReport(orderId, status, reason) {
  const report = {
    orderId,
    status,
    reason,
    timestamp: new Date().toISOString(),
  };
  await producer.send({
    topic: TOPICS.orderReport,
    messages: [{ key: orderId, value: JSON.stringify(report) }],
  });
}

async function publishTradeReport(order) {
  const trade = {
    tradeNo: `T${Date.now()}`,
    stockCode: order.stockCode,
    tradePrice: Number(order.price),
    tradeQuantity: Number(order.quantity),
    tradeTime: new Date().toISOString(),
  };

  if (order.side === "SELL") {
    trade.sellerOrderId = order.orderId;
  } else {
    trade.buyerOrderId = order.orderId;
  }

  await producer.send({
    topic: TOPICS.tradeReport,
    messages: [{ key: order.orderId, value: JSON.stringify(trade) }],
  });
}

function validateOrder(order) {
  if (!order.orderId) return "orderId is required";
  if (!/^\d{6}$/.test(String(order.stockCode || ""))) {
    return "stockCode must be a 6 digit code";
  }
  if (!["BUY", "SELL"].includes(order.side)) return "side must be BUY or SELL";
  if (!Number.isFinite(Number(order.price)) || Number(order.price) <= 0) {
    return "price must be greater than 0";
  }
  if (!Number.isInteger(Number(order.quantity)) || Number(order.quantity) <= 0) {
    return "quantity must be a positive integer";
  }
  return "";
}

function parseMessage(message) {
  try {
    return JSON.parse(message.value ? message.value.toString("utf8") : "{}");
  } catch (error) {
    console.warn("ignored invalid JSON message:", error.message);
    return null;
  }
}

function buildKafkaClientConfig() {
  const config = {
    clientId: process.env.MOCK_CENTRAL_CLIENT_ID || "mock-central-trading",
    brokers: (process.env.KAFKA_BROKERS || "localhost:9092")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };

  const ssl = buildKafkaSslConfig();
  if (ssl) config.ssl = ssl;

  const sasl = buildKafkaSaslConfig();
  if (sasl) config.sasl = sasl;

  return config;
}

function buildKafkaSslConfig() {
  if (process.env.KAFKA_SSL !== "true") return undefined;

  const ssl = {
    rejectUnauthorized: process.env.KAFKA_SSL_REJECT_UNAUTHORIZED !== "false",
  };
  const ca = readOptionalFile(process.env.KAFKA_SSL_CA_PATH);
  const cert = readOptionalFile(process.env.KAFKA_SSL_CERT_PATH);
  const key = readOptionalFile(process.env.KAFKA_SSL_KEY_PATH);

  if (ca) ssl.ca = [ca];
  if (cert) ssl.cert = cert;
  if (key) ssl.key = key;

  return ssl;
}

function buildKafkaSaslConfig() {
  const mechanism = process.env.KAFKA_SASL_MECHANISM;
  if (!mechanism) return undefined;

  if (!process.env.KAFKA_SASL_USERNAME || !process.env.KAFKA_SASL_PASSWORD) {
    throw new Error("Kafka SASL username and password are required");
  }

  return {
    mechanism,
    username: process.env.KAFKA_SASL_USERNAME,
    password: process.env.KAFKA_SASL_PASSWORD,
  };
}

function readOptionalFile(path) {
  if (!path) return undefined;
  return fs.readFileSync(path, "utf8");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown() {
  await consumer.disconnect();
  await producer.disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch((error) => {
  console.error("Mock central Kafka service failed:", error);
  process.exit(1);
});
