const express = require("express");
const pool = require("../db");
const { applyPendingKafkaReportsForOrder } = require("../kafka");

const router = express.Router();

const ORDER_FIELDS = {
  orderNo: "order_no",
  tradedQuantity: "traded_quantity",
  remainingQuantity: "remaining_quantity",
  orderStatus: "order_status",
  rejectReason: "reject_reason",
  reviewId: "review_id",
  reviewStatus: "review_status",
  reviewReason: "review_reason",
  centralStatus: "central_status",
  updateTime: "update_time",
};

router.get("/", async (req, res, next) => {
  try {
    const fundAccountNo = String(req.query.fundAccountNo || "");
    if (!/^\d{16}$/.test(fundAccountNo)) {
      return res.status(400).json({ ok: false, message: "Invalid fundAccountNo" });
    }

    const [rows] = await pool.execute(
      `SELECT *
       FROM order_record
       WHERE fund_account_no = ?
       ORDER BY submit_time DESC, local_order_id DESC`,
      [fundAccountNo],
    );
    res.json({ ok: true, data: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const body = req.body;
    const orderQuantity = Number(body.orderQuantity);
    const remainingQuantity = Number(body.remainingQuantity ?? orderQuantity);

    const [result] = await pool.execute(
      `INSERT INTO order_record (
        order_no,
        fund_account_no,
        security_account_no,
        stock_code,
        order_side,
        order_price,
        order_quantity,
        traded_quantity,
        remaining_quantity,
        frozen_amount,
        frozen_quantity,
        order_status,
        reject_reason,
        review_id,
        review_status,
        review_reason,
        central_status,
        submit_time,
        update_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        body.orderNo || null,
        body.fundAccountNo,
        body.securityAccountNo,
        body.stockCode,
        body.orderSide,
        Number(body.orderPrice),
        orderQuantity,
        Number(body.tradedQuantity || 0),
        remainingQuantity,
        Number(body.frozenAmount || 0),
        Number(body.frozenQuantity || 0),
        body.orderStatus || "SUBMITTED",
        body.rejectReason || null,
        body.reviewId || null,
        body.reviewStatus || null,
        body.reviewReason || null,
        body.centralStatus || null,
      ],
    );

    await applyPendingKafkaReportsForOrder(body.orderNo);

    res.status(201).json({
      ok: true,
      data: { localOrderId: result.insertId },
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:localOrderId", async (req, res, next) => {
  try {
    const localOrderId = Number(req.params.localOrderId);
    const assignments = [];
    const values = [];

    Object.entries(ORDER_FIELDS).forEach(([bodyKey, column]) => {
      if (Object.prototype.hasOwnProperty.call(req.body, bodyKey)) {
        assignments.push(`${column} = ?`);
        values.push(req.body[bodyKey]);
      }
    });

    if (!assignments.length) {
      return res.status(400).json({ ok: false, message: "No fields to update" });
    }

    if (!assignments.some((item) => item.startsWith("update_time"))) {
      assignments.push("update_time = NOW()");
    }

    values.push(localOrderId);
    const [result] = await pool.execute(
      `UPDATE order_record SET ${assignments.join(", ")} WHERE local_order_id = ?`,
      values,
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }
    res.json({ ok: true, data: { localOrderId } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
