-- Canonical product catalog for quote recovery and new order line associations.
-- Source of truth: src/RetailCheckout.tsx (SKU, size and color options),
-- lib/retail-reference.ts and public/retail-reference-prices.json (retail reference prices).
-- Wholesale price tiers are intentionally not seeded: they require an approved quotation.
-- This migration is idempotent and does not rewrite existing product/variant records.

INSERT INTO products (id,sku,slug,name,product_family,description,status,default_currency,retail_price,wholesale_enabled,sort_order)
VALUES ('catalog-p1','P1','flocked-silent-basketball-set','Flocked Silent Basketball Set','SILENT_BALL','Flocked-cover silent basketball set. Available sizes: 3, 5 and 7. Retail prices are reference prices; shipping and taxes excluded.','ACTIVE','USD',NULL,1,1)
ON CONFLICT(sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s3-orange',p.id,'P1-S3-ORANGE','No. 3 / Orange','3','Orange','P1-S3',9.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s3-blue',p.id,'P1-S3-BLUE','No. 3 / Blue','3','Blue','P1-S3',9.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s3-green',p.id,'P1-S3-GREEN','No. 3 / Green','3','Green','P1-S3',9.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s3-yellow',p.id,'P1-S3-YELLOW','No. 3 / Yellow','3','Yellow','P1-S3',9.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s5-orange',p.id,'P1-S5-ORANGE','No. 5 / Orange','5','Orange','P1-S5',11.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s5-blue',p.id,'P1-S5-BLUE','No. 5 / Blue','5','Blue','P1-S5',11.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s5-green',p.id,'P1-S5-GREEN','No. 5 / Green','5','Green','P1-S5',11.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s5-yellow',p.id,'P1-S5-YELLOW','No. 5 / Yellow','5','Yellow','P1-S5',11.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s7-orange',p.id,'P1-S7-ORANGE','No. 7 / Orange','7','Orange','P1-S7',14.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s7-blue',p.id,'P1-S7-BLUE','No. 7 / Blue','7','Blue','P1-S7',14.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s7-green',p.id,'P1-S7-GREEN','No. 7 / Green','7','Green','P1-S7',14.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p1-s7-yellow',p.id,'P1-S7-YELLOW','No. 7 / Yellow','7','Yellow','P1-S7',14.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P1'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO products (id,sku,slug,name,product_family,description,status,default_currency,retail_price,wholesale_enabled,sort_order)
VALUES ('catalog-p2','P2','fabric-cover-silent-basketball-set','Fabric-Cover Silent Basketball Set','SILENT_BALL','Fabric-cover silent basketball set. Available sizes: 3, 5 and 7. Retail prices are reference prices; shipping and taxes excluded.','ACTIVE','USD',NULL,1,2)
ON CONFLICT(sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p2-s3-orange',p.id,'P2-S3-ORANGE','No. 3 / Orange','3','Orange','P2-S3',10.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P2'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p2-s3-green',p.id,'P2-S3-GREEN','No. 3 / Green','3','Green','P2-S3',10.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P2'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p2-s5-orange',p.id,'P2-S5-ORANGE','No. 5 / Orange','5','Orange','P2-S5',12.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P2'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p2-s5-green',p.id,'P2-S5-GREEN','No. 5 / Green','5','Green','P2-S5',12.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P2'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p2-s7-orange',p.id,'P2-S7-ORANGE','No. 7 / Orange','7','Orange','P2-S7',15.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P2'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p2-s7-green',p.id,'P2-S7-GREEN','No. 7 / Green','7','Green','P2-S7',15.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P2'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO products (id,sku,slug,name,product_family,description,status,default_currency,retail_price,wholesale_enabled,sort_order)
VALUES ('catalog-p3','P3','weighted-flocked-silent-basketball','Weighted Flocked Silent Basketball','SILENT_BALL','Weighted flocked silent basketball. Available sizes: 3, 4, 6 and 7. Retail prices are reference prices; shipping and taxes excluded.','ACTIVE','USD',NULL,1,3)
ON CONFLICT(sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s3-orange',p.id,'P3-S3-ORANGE','No. 3 / Orange','3','Orange','P3-S3',12.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s3-brown',p.id,'P3-S3-BROWN','No. 3 / Brown','3','Brown','P3-S3',12.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s3-black',p.id,'P3-S3-BLACK','No. 3 / Black','3','Black','P3-S3',12.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s3-aqua-blue',p.id,'P3-S3-AQUA-BLUE','No. 3 / Aqua Blue','3','Aqua Blue','P3-S3',12.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s4-orange',p.id,'P3-S4-ORANGE','No. 4 / Orange','4','Orange','P3-S4',14.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s4-brown',p.id,'P3-S4-BROWN','No. 4 / Brown','4','Brown','P3-S4',14.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s4-black',p.id,'P3-S4-BLACK','No. 4 / Black','4','Black','P3-S4',14.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s4-aqua-blue',p.id,'P3-S4-AQUA-BLUE','No. 4 / Aqua Blue','4','Aqua Blue','P3-S4',14.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s6-orange',p.id,'P3-S6-ORANGE','No. 6 / Orange','6','Orange','P3-S6',18.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s6-brown',p.id,'P3-S6-BROWN','No. 6 / Brown','6','Brown','P3-S6',18.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s6-black',p.id,'P3-S6-BLACK','No. 6 / Black','6','Black','P3-S6',18.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s6-aqua-blue',p.id,'P3-S6-AQUA-BLUE','No. 6 / Aqua Blue','6','Aqua Blue','P3-S6',18.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s7-orange',p.id,'P3-S7-ORANGE','No. 7 / Orange','7','Orange','P3-S7',21.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s7-brown',p.id,'P3-S7-BROWN','No. 7 / Brown','7','Brown','P3-S7',21.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s7-black',p.id,'P3-S7-BLACK','No. 7 / Black','7','Black','P3-S7',21.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p3-s7-aqua-blue',p.id,'P3-S7-AQUA-BLUE','No. 7 / Aqua Blue','7','Aqua Blue','P3-S7',21.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P3'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO products (id,sku,slug,name,product_family,description,status,default_currency,retail_price,wholesale_enabled,sort_order)
VALUES ('catalog-p4','P4','flocked-silent-soccer-ball','Flocked Silent Soccer Ball','SILENT_BALL','Flocked silent soccer ball, size 5. Retail price is a reference price; shipping and taxes excluded.','ACTIVE','USD',NULL,1,4)
ON CONFLICT(sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p4-s5-black-white',p.id,'P4-S5-BLACK-WHITE','No. 5 / Black/White','5','Black/White','P4-S5',17.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P4'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p4-s5-black-green',p.id,'P4-S5-BLACK-GREEN','No. 5 / Black/Green','5','Black/Green','P4-S5',17.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P4'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p4-s5-black-red',p.id,'P4-S5-BLACK-RED','No. 5 / Black/Red','5','Black/Red','P4-S5',17.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P4'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p4-s5-yellow-green',p.id,'P4-S5-YELLOW-GREEN','No. 5 / Yellow/Green','5','Yellow/Green','P4-S5',17.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P4'
ON CONFLICT(variant_sku) DO NOTHING;
INSERT INTO product_variants (id,product_id,variant_sku,name,size,color,configuration,retail_price,active,inventory_status)
SELECT 'variant-p4-s5-black-gold',p.id,'P4-S5-BLACK-GOLD','No. 5 / Black/Gold','5','Black/Gold','P4-S5',17.9,1,'AVAILABLE'
FROM products p WHERE p.sku='P4'
ON CONFLICT(variant_sku) DO NOTHING;

-- Deliberately no INSERT into price_tiers: wholesale pricing remains quotation-driven.
