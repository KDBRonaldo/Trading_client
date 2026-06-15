const express = require("express");
const {
  getCachedStockQuotes,
  getKafkaStatus,
  publishCancelCommand,
  publishOrderCommand,
  publishStockQuery,
} = require("../kafka");

const router = express.Router();

router.get("/kafka/status", (req, res) => {
  res.json({ ok: true, data: getKafkaStatus() });
});

router.post("/orders", async (req, res, next) => {
  try {
    const body = req.body;
    const orderNo = body.orderNo || `C${Date.now()}`;
    const message = await publishOrderCommand({
      orderNo,
      fundAccountNo: body.fundAccountNo,
      stockCode: body.stockCode,
      direction: body.direction,
      price: body.price,
      quantity: body.quantity,
      timestamp: body.timestamp,
    });

    res.status(202).json({
      success: true,
      data: {
        accepted: true,
        orderNo,
        status: "SUBMITTED",
        kafkaMessage: message,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/orders/:orderId/cancel", async (req, res, next) => {
  try {
    const message = await publishCancelCommand({
      orderId: req.params.orderId,
      fundAccountNo: req.body.fundAccountNo,
      timestamp: req.body.timestamp,
    });

    res.status(202).json({
      success: true,
      data: {
        canceled: true,
        status: "CANCEL_REQUESTED",
        kafkaMessage: message,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/stock-queries", async (req, res, next) => {
  try {
    const stockCode = String(req.body.stockCode || req.query.stockCode || "");
    if (!/^\d{6}$/.test(stockCode)) {
      return res.status(400).json({ ok: false, message: "Invalid stockCode" });
    }

    const message = await publishStockQuery(stockCode);
    res.status(202).json({
      ok: true,
      message: "Stock query sent to central trading system. A response topic is still required for synchronous quote display.",
      data: message,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/stocks", async (req, res, next) => {
  try {
    const keyword = String(req.query.keyword || "");
    if (/^\d{6}$/.test(keyword)) {
      await publishStockQuery(keyword);
    }

    const stocks = getCachedStockQuotes(keyword);
    res.json({
      ok: true,
      pending: /^\d{6}$/.test(keyword) && stocks.length === 0,
      message: stocks.length ? "Quote cache returned" : "Quote query sent. Please refresh after central trading publishes client.stock.quote.",
      data: stocks,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/orders/:orderId/result", async (req, res) => {
  res.status(202).json({
    ok: false,
    pending: true,
    message: "Order results are consumed from Kafka asynchronously. Refresh local orders/trades after the report is received.",
  });
});

module.exports = router;
