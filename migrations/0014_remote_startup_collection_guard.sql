-- Startup limits are intentionally below remote seller economic thresholds.
-- The last INSERT of the atomic checkout batch checks all paid history plus
-- active retail reservations, including this new order. Concurrent submissions
-- cannot pass an earlier read and overrun the startup limit.
CREATE TRIGGER IF NOT EXISTS remote_startup_collection_guard
BEFORE INSERT ON retail_checkout_requests
WHEN EXISTS (SELECT 1 FROM quotes WHERE id=NEW.quote_id AND notes LIKE 'REMOTE_STARTUP:%')
BEGIN
 SELECT CASE WHEN (
  SELECT COUNT(*) FROM orders o LEFT JOIN quotes q ON q.id=o.quote_id
  WHERE EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status IN ('RECEIVED','REFUNDED','PARTIAL_REFUND'))
  OR (o.reference LIKE 'ME-RO-%' AND o.status='PAYMENT_PENDING' AND o.payment_status='UNPAID' AND q.valid_until>=datetime('now'))
 )>150 THEN RAISE(ABORT,'REMOTE_STARTUP_REVIEW_REQUIRED') END;
 SELECT CASE WHEN (
  SELECT COALESCE(SUM(CAST(ROUND(o.total*100) AS INTEGER)),0) FROM orders o LEFT JOIN quotes q ON q.id=o.quote_id
  WHERE EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status IN ('RECEIVED','REFUNDED','PARTIAL_REFUND'))
  OR (o.reference LIKE 'ME-RO-%' AND o.status='PAYMENT_PENDING' AND o.payment_status='UNPAID' AND q.valid_until>=datetime('now'))
 )>5000000 THEN RAISE(ABORT,'REMOTE_STARTUP_REVIEW_REQUIRED') END;
END;
