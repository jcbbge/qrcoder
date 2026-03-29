# Database Schema

> Last updated: 2024-04-28
> Version: 1.0.0

## Tables

### product_cards
Product information and QR code tracking.

| Column           | Type                     | Nullable | Default           | Description |
|-----------------|--------------------------|----------|-------------------|-------------|
| id              | integer                  | NOT NULL | nextval('product_cards_id_seq') | Primary key |
| shopify_id      | text                     | YES      |                   | Shopify product ID |
| product_name    | text                     | NOT NULL |                   | Name of the product |
| artist_name     | text                     | NOT NULL |                   | Artist's name |
| price           | text                     | YES      |                   | Product price |
| image_url       | text                     | YES      |                   | Product image URL |
| onlineStoreUrl     | text                     | YES      |                   | Shopify product URL |
| status          | text                     | YES      | 'unassigned'      | Product status (unprocessed/assigned/printed) |
| page_id         | integer                  | YES      |                   | Reference to pages table |
| page_position   | integer                  | YES      |                   | Position on the page |
| qr_code_generated| integer                 | YES      | 0                 | QR code generation status |
| custom_data     | text                     | YES      | '{}'              | JSON custom data |
| metrics         | text                     | YES      | '{"scanCount": 0, "lastScanAt": null}' | QR code metrics |
| created_at      | timestamp without time zone | YES   | CURRENT_TIMESTAMP | Creation timestamp |
| updated_at      | timestamp without time zone | YES   | CURRENT_TIMESTAMP | Last update timestamp |
| downloaded_at   | timestamp without time zone | YES   |                   | Last download timestamp |
| printed_at      | timestamp without time zone | YES   |                   | Last print timestamp |

**Indexes:**
- `product_cards_pkey` PRIMARY KEY (id)
- `idx_product_cards_created_at` (created_at)
- `idx_product_cards_page_id` (page_id)
- `idx_product_cards_shopify_id` (shopify_id)
- `idx_product_cards_status` (status)
- `product_cards_shopify_id_key` UNIQUE (shopify_id)

**Check Constraints:**
- `product_cards_status_check`: status IN ('unprocessed', 'assigned', 'printed')

### pages
QR code page management and tracking.

| Column        | Type                     | Nullable | Default | Description |
|--------------|--------------------------|----------|----------|-------------|
| id           | integer                  | NOT NULL | nextval('pages_id_seq') | Primary key |
| name         | text                     | NOT NULL |          | Page name |
| type         | text                     | YES      | 'auto'   | Page type (auto/custom) |
| status       | text                     | YES      | 'ready'  | Page status (ready/in_progress/done) |
| card_ids     | text                     | YES      | '[]'     | JSON array of card IDs |
| pdf_url      | text                     | YES      |          | Generated PDF URL |
| custom_data  | text                     | YES      | '{}'     | JSON custom data |
| metrics      | text                     | YES      | '{"totalScans": 0, "printCount": 0, "downloadCount": 0}' | Page metrics |
| created_at   | timestamp without time zone | YES   | CURRENT_TIMESTAMP | Creation timestamp |
| updated_at   | timestamp without time zone | YES   | CURRENT_TIMESTAMP | Last update timestamp |
| printed_at   | timestamp without time zone | YES   |          | Last print timestamp |
| printed_by   | text                     | YES      |          | User who printed |
| downloaded_at| timestamp without time zone | YES   |          | Last download timestamp |
| downloaded_by| text                     | YES      |          | User who downloaded |

**Indexes:**
- `pages_pkey` PRIMARY KEY (id)
- `idx_pages_status` (status)
- `idx_pages_type` (type)

**Check Constraints:**
- `pages_status_check`: status IN ('ready', 'in_progress', 'done')
- `pages_type_check`: type IN ('auto', 'custom')

### queues
Print queue management.

| Column       | Type                     | Nullable | Default | Description |
|-------------|--------------------------|----------|----------|-------------|
| id          | integer                  | NOT NULL | nextval('queues_id_seq') | Primary key |
| name        | text                     | NOT NULL |          | Queue name |
| status      | text                     | YES      | 'pending'| Queue status (pending/processed) |
| page_ids    | text                     | YES      | '[]'     | JSON array of page IDs |
| custom_data | text                     | YES      | '{}'     | JSON custom data |
| metrics     | text                     | YES      | '{"totalPages": 0, "totalCards": 0}' | Queue metrics |
| created_at  | timestamp without time zone | YES   | CURRENT_TIMESTAMP | Creation timestamp |
| updated_at  | timestamp without time zone | YES   | CURRENT_TIMESTAMP | Last update timestamp |
| processed_at| timestamp without time zone | YES   |          | Processing completion timestamp |
| processed_by| text                     | YES      |          | User who processed the queue |

**Indexes:**
- `queues_pkey` PRIMARY KEY (id)
- `idx_queues_status` (status)

**Check Constraints:**
- `queues_status_check`: status IN ('pending', 'processed')

## Relationships

1. `product_cards.page_id` → `pages.id`: Links products to their assigned pages
2. `pages.card_ids` contains `product_cards.id`: JSON array referencing products on the page
3. `queues.page_ids` contains `pages.id`: JSON array referencing pages in the queue

## Common Queries

### Get Products Ready for Page Assignment
```sql
SELECT * FROM product_cards
WHERE status = 'unprocessed'
ORDER BY created_at ASC;
```

### Get Pages Ready for Printing
```sql
SELECT * FROM pages
WHERE status = 'ready'
  AND printed_at IS NULL
ORDER BY created_at ASC;
```

### Get Active Print Queues
```sql
SELECT * FROM queues
WHERE status = 'pending'
ORDER BY created_at DESC;
```
