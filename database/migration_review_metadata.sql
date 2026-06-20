USE trading_client;

-- This migration is for MySQL versions that do not support ADD COLUMN IF NOT EXISTS.
-- Run each statement only when the corresponding column/index is absent.
ALTER TABLE order_record ADD COLUMN review_id VARCHAR(64) NULL AFTER reject_reason;
ALTER TABLE order_record ADD COLUMN review_status VARCHAR(32) NULL AFTER review_id;
ALTER TABLE order_record ADD COLUMN review_reason VARCHAR(512) NULL AFTER review_status;
ALTER TABLE order_record ADD COLUMN central_status VARCHAR(64) NULL AFTER review_reason;
ALTER TABLE order_record ADD INDEX idx_order_record_review_id (review_id);
