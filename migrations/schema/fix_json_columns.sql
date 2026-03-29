-- Convert TEXT columns to JSONB for proper JSON operations
ALTER TABLE product_cards
  ALTER COLUMN custom_data TYPE JSONB USING custom_data::jsonb,
  ALTER COLUMN metrics TYPE JSONB USING metrics::jsonb;

ALTER TABLE pages
  ALTER COLUMN custom_data TYPE JSONB USING custom_data::jsonb,
  ALTER COLUMN metrics TYPE JSONB USING metrics::jsonb,
  ALTER COLUMN card_ids TYPE integer[] USING array_remove(string_to_array(trim(both '[]' from card_ids), ',')::integer[], NULL);

ALTER TABLE queues
  ALTER COLUMN custom_data TYPE JSONB USING custom_data::jsonb,
  ALTER COLUMN metrics TYPE JSONB USING metrics::jsonb,
  ALTER COLUMN page_ids TYPE integer[] USING array_remove(string_to_array(trim(both '[]' from page_ids), ',')::integer[], NULL);

-- Fix column name to follow convention
ALTER TABLE product_cards RENAME COLUMN "onlineStoreUrl" TO online_store_url;

-- Add constraints to ensure JSON validity
ALTER TABLE product_cards ADD CONSTRAINT ensure_custom_data_json CHECK (custom_data IS NULL OR (custom_data::text != '' AND custom_data::text != 'null'));
ALTER TABLE product_cards ADD CONSTRAINT ensure_metrics_json CHECK (metrics IS NULL OR (metrics::text != '' AND metrics::text != 'null'));

ALTER TABLE pages ADD CONSTRAINT ensure_custom_data_json CHECK (custom_data IS NULL OR (custom_data::text != '' AND custom_data::text != 'null'));
ALTER TABLE pages ADD CONSTRAINT ensure_metrics_json CHECK (metrics IS NULL OR (metrics::text != '' AND metrics::text != 'null'));

ALTER TABLE queues ADD CONSTRAINT ensure_custom_data_json CHECK (custom_data IS NULL OR (custom_data::text != '' AND custom_data::text != 'null'));
ALTER TABLE queues ADD CONSTRAINT ensure_metrics_json CHECK (metrics IS NULL OR (metrics::text != '' AND metrics::text != 'null'));
