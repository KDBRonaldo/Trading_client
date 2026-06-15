const pool = require("./db");

let Kafka;
try {
  ({ Kafka } = require("kafkajs"));
} catch (error) {
  Kafka = null;
}

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

const STATUS_MAP = {
  ACCEPTED: "SUBMITTED",
  SUBMITTED: "SUBMITTED",
  TRADED: "TRADED",
  PART_TRADED: "PART_TRADED",
  PARTIAL_FILLED: "PART_TRADED",
  CANCELED: "CANCELED",
  CANCELLED: "CANCELED",
  EXPIRED: "EXPIRED",
  REJECTED: "REJECTED",
};

let producer;
let consumer;
let kafkaStarted = false;
let kafkaStartError = "";
const stockQuotes = new Map();

function kafkaEnabled() {
  return process.env.KAFKA_ENABLED === "true";
}

function requireKafkaReady() {
  if (!kafkaEnabled()) {
    const error = new Error(
      "Kafka is disabled. Set KAFKA_ENABLED=true to use the central trading pipeline.",
    );
    error.statusCode = 503;
    throw error;
  }
  if (!Kafka) {
    const error = new Error(
      "kafkajs is not installed. Run npm install before enabling Kafka.",
    );
    error.statusCode = 503;
    throw error;
  }
  if (!producer || !kafkaStarted) {
    const error = new Error(kafkaStartError || "Kafka is not connected yet.");
    error.statusCode = 503;
    throw error;
  }
}

async function startKafka() {
  if (!kafkaEnabled()) {
    return { ok: false, message: "Kafka disabled" };
  }
  if (!Kafka) {
    kafkaStartError = "kafkajs is not installed";
    return { ok: false, message: kafkaStartError };
  }

  const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || "trading-client",
    brokers: (process.env.KAFKA_BROKERS || "localhost:9092")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  });

  producer = kafka.producer();
  consumer = kafka.consumer({
    groupId: process.env.KAFKA_GROUP_ID || "trading-client-group",
  });

  try {
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({
      topic: TOPICS.tradeReport,
      fromBeginning: false,
    });
    await consumer.subscribe({
      topic: TOPICS.orderReport,
      fromBeginning: false,
    });
    await consumer.subscribe({
      topic: TOPICS.stockQuote,
      fromBeginning: false,
    });
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const payload = parseMessage(message);
        if (topic === TOPICS.tradeReport) {
          await handleTradeReport(payload);
        } else if (topic === TOPICS.orderReport) {
          await handleOrderReport(payload);
        } else if (topic === TOPICS.stockQuote) {
          handleStockQuote(payload);
        }
      },
    });
    kafkaStarted = true;
    return { ok: true };
  } catch (error) {
    kafkaStartError = error.message;
    console.error("Kafka startup failed:", error);
    return { ok: false, message: error.message };
  }
}

function parseMessage(message) {
  const raw = message.value ? message.value.toString() : "{}";
  return JSON.parse(raw);
}

async function publishOrderCommand(order) {
  requireKafkaReady();
  const value = {
    accountId: order.fundAccountNo,
    orderId: order.orderNo,
    stockCode: order.stockCode,
    side: order.direction,
    price: Number(order.price),
    quantity: Number(order.quantity),
    timestamp: order.timestamp || new Date().toISOString(),
  };
  await producer.send({
    topic: TOPICS.orderCommand,
    messages: [{ key: value.orderId, value: JSON.stringify(value) }],
  });
  return value;
}

async function publishCancelCommand(cancel) {
  requireKafkaReady();
  const value = {
    orderId: cancel.orderId,
    accountId: cancel.fundAccountNo,
    timestamp: cancel.timestamp || new Date().toISOString(),
  };
  await producer.send({
    topic: TOPICS.cancelCommand,
    messages: [{ key: value.orderId, value: JSON.stringify(value) }],
  });
  return value;
}

async function publishStockQuery(stockCode) {
  requireKafkaReady();
  const value = {
    stockCode,
    queryId: `Q${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
  await producer.send({
    topic: TOPICS.stockQuery,
    messages: [{ key: stockCode, value: JSON.stringify(value) }],
  });
  return value;
}

function handleStockQuote(payload) {
  const rows = Array.isArray(payload) ? payload : payload.stocks || [payload];
  rows.forEach((item) => {
    if (!item || !item.stockCode) return;
    const quote = normalizeStockQuote(item);
    stockQuotes.set(quote.stockCode, quote);
  });
}

function normalizeStockQuote(item) {
  return {
    stockCode: String(item.stockCode),
    stockName: item.stockName || item.name || "",
    latestPrice: Number(
      item.latestPrice ?? item.latest ?? item.currentPrice ?? 0,
    ),
    previousClose: Number(
      item.previousClose ??
        item.prevClose ??
        item.latestPrice ??
        item.latest ??
        0,
    ),
    highestPrice: Number(
      item.highestPrice ?? item.high ?? item.latestPrice ?? item.latest ?? 0,
    ),
    lowestPrice: Number(
      item.lowestPrice ?? item.low ?? item.latestPrice ?? item.latest ?? 0,
    ),
    bidPrice: Number(
      item.bidPrice ?? item.buyOne ?? item.latestPrice ?? item.latest ?? 0,
    ),
    askPrice: Number(
      item.askPrice ?? item.sellOne ?? item.latestPrice ?? item.latest ?? 0,
    ),
    tradeStatus: item.tradeStatus || item.status || "可交易",
    notice: item.notice || item.announcement || "",
    quoteTime: item.quoteTime || item.timestamp || new Date().toISOString(),
  };
}

function getCachedStockQuotes(keyword = "") {
  const query = String(keyword || "").trim();
  const rows = Array.from(stockQuotes.values());
  if (!query) return rows;
  return rows.filter(
    (item) =>
      item.stockCode === query ||
      (item.stockName && item.stockName.includes(query)),
  );
}

async function handleTradeReport(report) {
  const orderNos = [
    report.buyerOrderId,
    report.sellOrderId,
    report.sellerOrderId,
    report.orderId,
    report.orderNo,
  ].filter(Boolean);
  const tradeQuantity = Number(report.tradeQuantity ?? report.quantity ?? 0);
  const tradePrice = Number(report.tradePrice ?? report.price ?? 0);
  if (!orderNos.length || tradeQuantity <= 0 || tradePrice <= 0) return;

  for (const orderNo of orderNos) {
    await applyTradeReportToOrder(orderNo, report, tradePrice, tradeQuantity);
  }
}

async function applyTradeReportToOrder(
  orderNo,
  report,
  tradePrice,
  tradeQuantity,
) {
  const [orders] = await pool.execute(
    `SELECT local_order_id, order_quantity, traded_quantity, stock_code
     FROM order_record
     WHERE order_no = ?
     LIMIT 1`,
    [orderNo],
  );
  if (!orders.length) return;

  const order = orders[0];
  const nextTradedQuantity = Number(order.traded_quantity) + tradeQuantity;
  const remainingQuantity = Math.max(
    0,
    Number(order.order_quantity) - nextTradedQuantity,
  );
  const orderStatus = remainingQuantity === 0 ? "TRADED" : "PART_TRADED";
  const tradeNo = report.tradeNo
    ? `${report.tradeNo}-${order.local_order_id}`
    : `TR-${orderNo}-${Date.now()}`;

  await pool.execute(
    `UPDATE order_record
     SET traded_quantity = ?, remaining_quantity = ?, order_status = ?, update_time = NOW()
     WHERE local_order_id = ?`,
    [nextTradedQuantity, remainingQuantity, orderStatus, order.local_order_id],
  );

  await pool.execute(
    `INSERT INTO trade_record (
       trade_no, local_order_id, order_no, stock_code, trade_price,
       trade_quantity, trade_amount, trade_time
     ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE trade_no = trade_no`,
    [
      tradeNo,
      order.local_order_id,
      orderNo,
      report.stockCode || order.stock_code,
      tradePrice,
      tradeQuantity,
      tradePrice * tradeQuantity,
    ],
  );
}

async function handleOrderReport(report) {
  const orderNo = report.orderId || report.orderNo;
  if (!orderNo) return;

  const status =
    STATUS_MAP[report.status] ||
    STATUS_MAP[report.result] ||
    report.status ||
    report.result ||
    "SUBMITTED";
  const rejectReason = report.reason || report.message || null;

  await pool.execute(
    `UPDATE order_record
     SET order_status = ?, reject_reason = ?, update_time = NOW()
     WHERE order_no = ?`,
    [status, rejectReason, orderNo],
  );
}

function getKafkaStatus() {
  return {
    enabled: kafkaEnabled(),
    started: kafkaStarted,
    error: kafkaStartError,
    topics: TOPICS,
  };
}

module.exports = {
  TOPICS,
  getKafkaStatus,
  startKafka,
  publishOrderCommand,
  publishCancelCommand,
  publishStockQuery,
  getCachedStockQuotes,
};
