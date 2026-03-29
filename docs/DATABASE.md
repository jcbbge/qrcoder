# Database Guide for QR Coder

## Architecture Overview

### Database Clients
1. **Main Application Client** (`src/db.js`)
   - Primary interface for the web application
   - Uses connection pooling for efficient connection management
   - Handles all CRUD operations for product cards, pages, and queues

2. **Script Client** (`scripts/lib/neon-script-client.js`)
   - Dedicated client for maintenance scripts and one-off operations
   - Separate connection pool to avoid interfering with main application
   - Includes built-in logging and error handling

### Connection Management
- Uses Neon PostgreSQL
- Connection details sourced from environment variables:
  - Primary: `DATABASE_URL` (preferred)
  - Fallback: Individual vars (`PGHOST`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`)

## Connecting via CLI (Neon + psql)

To run direct SQL commands or inspect the schema using the command line:

1.  **Get the Connection String:**
    Use the Neon CLI, specifying the project ID for this application:
    ```bash
    neon connection-string --project-id floral-silence-18338239
    ```
    Copy the output connection string (it looks like `postgres://user:password@host:port/database`).
    The specific string for this project (as of the last check) is:
    `postgresql://USER:PASSWORD@HOST/DBNAME`

2.  **Connect with `psql`:**
    Use the standard `psql` client with the copied connection string. **Make sure to enclose the connection string in single quotes.**
    ```bash
    # Example: Describe a table
    psql '<YOUR_COPIED_CONNECTION_STRING>' -c '\\d your_table_name' | cat

    # Example: Run a select query
    psql '<YOUR_COPIED_CONNECTION_STRING>' -c 'SELECT * FROM your_table_name LIMIT 5;' | cat

    # Example: Connect interactively
    psql '<YOUR_COPIED_CONNECTION_STRING>'
    ```
    Using `| cat` ensures the output is displayed directly without paging issues.

## ⚠️ Critical Data Formats

### JSON Fields
Several tables contain JSON fields that MUST follow specific formats:

1. **pages.card_ids**
   - MUST be a valid JSON array: `[1234, 5678]`
   - NEVER use object notation: `{"1234"}` (THIS CAUSED A MAJOR BUG!)
   - Always use `JSON.stringify()` before storing
   - Example:
   ```javascript
   // ✅ CORRECT
   await db.execute(query, [JSON.stringify([1234, 5678])]);

   // ❌ WRONG
   await db.execute(query, ["{1234, 5678}"]);
   ```

2. **product_cards.custom_data**
   - Must be a valid JSON object
   - Default: `{}`

3. **product_cards.metrics**
   - Must be a valid JSON object
   - Default: `{ scanCount: 0, lastScanAt: null }`

### PostgreSQL Naming Conventions
1. **Case Sensitivity Rules**
   - Unquoted identifiers are folded to lowercase
   - Use double quotes to preserve case: `"onlineStoreUrl"`
   - Our convention:
     - camelCase for Shopify API fields (must be quoted)
     - snake_case for our fields (no quotes needed)

## Best Practices

### 1. Data Validation
ALWAYS validate data before inserting/updating:
```javascript
// Validate card_ids
let cardIds = data.card_ids;
if (typeof cardIds === 'string') {
  try {
    cardIds = JSON.parse(cardIds);
  } catch (e) {
    console.error('Invalid card_ids JSON:', e);
    throw new Error('Invalid card_ids format');
  }
}
if (!Array.isArray(cardIds)) {
  cardIds = [cardIds];
}
```

### 2. Error Handling
```javascript
try {
  const result = await db.execute(query, params);
  console.log('Operation successful:', result.rowCount);
} catch (error) {
  console.error('Database error:', {
    operation: 'description',
    error: error.message,
    query: query.split('\n')[0], // First line only for logging
    params: params
  });
  throw error;
}
```

### 3. Transaction Management
For multi-step operations:
```javascript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... operations ...
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

## Database Scripts

### Running Scripts
1. Always use the script client for maintenance:
```javascript
import { query } from '../scripts/lib/neon-script-client.js';
```

2. Test scripts in development first:
```bash
NODE_ENV=development node scripts/your-script.js
```

### Creating New Scripts
1. Place in `scripts/` directory
2. Use the script client
3. Include logging
4. Add to this documentation

## Common Issues & Solutions

### 1. JSON Parse Errors
If you see: `JSON Parse error: Expected ':' before value`
- Check the format of JSON fields
- Use data validation helpers
- Run the fix script: `node scripts/fix-card-ids.js`

### 2. Case Sensitivity Issues
If you see: `column "onlinestoreurl" does not exist`
- Add double quotes around camelCase columns
- Check the column naming convention

### 3. Connection Issues
If you see: `Connection terminated unexpectedly`
- Check environment variables
- Verify Neon database status
- Check connection pool settings

## Monitoring & Maintenance

### Regular Checks
1. Run validation scripts weekly:
```bash
node scripts/validate-json-fields.js
```

2. Monitor connection pool health:
```sql
SELECT * FROM pg_stat_activity
WHERE datname = current_database();
```

### Emergency Procedures
1. If JSON fields are corrupted:
```bash
node scripts/fix-card-ids.js
```

2. If connections are stuck:
```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = current_database()
AND pid <> pg_backend_pid()
AND state = 'idle';
```

## Schema Changes
When modifying the schema:
1. Create a migration in `migrations/schema/`
2. Test in development
3. Update this documentation
4. Update validation scripts

Remember: Always backup data before running schema changes!

## Table Schemas

**Source of Truth:** Schemas below are based on `psql \d <table_name>` output from Neon as of 2025-05-02. Verify against the live database if discrepancies are suspected.

### `product_cards`

Stores individual product information, primarily synced from Shopify.

| Column            | Type                        | Nullable | Default                             | Description                                                                 |
|-------------------|-----------------------------|----------|-------------------------------------|-----------------------------------------------------------------------------|
| `id`              | integer                     | NOT NULL | nextval sequence                    | Unique identifier for the product card entry.                               |
| `shopify_id`      | text                        | YES      |                                     | Shopify Product GID (e.g., gid://shopify/Product/...). Unique.              |
| `product_name`    | text                        | NOT NULL |                                     | Name of the product.                                                        |
| `artist_name`     | text                        | NOT NULL |                                     | Vendor/Artist name.                                                         |
| `price`           | text                        | YES      |                                     | Price of the product (stored as text).                                      |
| `image_url`       | text                        | YES      |                                     | URL of the product image.                                                   |
| `onlineStoreUrl`  | text                        | YES      |                                     | Direct URL to the product on the Shopify store (Case-sensitive column name). |
| `status`          | text                        | YES      | 'unassigned'::text                  | Status (e.g., unassigned, assigned, downloaded, printed).                  |
| `page_id`         | integer                     | YES      |                                     | Foreign key linking to the `pages` table.                                   |
| `page_position`   | integer                     | YES      |                                     | Position of the card on the page (if applicable).                           |
| `qr_code_generated`| integer                    | YES      | 0                                   | Flag or count related to QR code generation.                                |
| `custom_data`     | text                        | YES      | '{}'::text                           | JSON stored as text (legacy?), for sync info etc. Needs parsing.            |
| `metrics`         | text                        | YES      | '{"scanCount": 0, ...}'::text    | JSON stored as text (legacy?), for scan counts etc. Needs parsing.          |
| `created_at`      | timestamp without time zone | YES      | CURRENT_TIMESTAMP                   | Timestamp of creation.                                                      |
| `updated_at`      | timestamp without time zone | YES      | CURRENT_TIMESTAMP                   | Timestamp of last update.                                                   |
| `downloaded_at`   | timestamp without time zone | YES      |                                     | Timestamp when associated page was downloaded.                              |
| `printed_at`      | timestamp without time zone | YES      |                                     | Timestamp when associated page was printed.                                 |

**Indexes:**
*   `product_cards_pkey` (Primary Key, btree on `id`)
*   `idx_product_cards_created_at` (btree on `created_at`)
*   `idx_product_cards_page_id` (btree on `page_id`)
*   `idx_product_cards_shopify_id` (btree on `shopify_id`)
*   `idx_product_cards_status` (btree on `status`)
*   `product_cards_shopify_id_key` (Unique Constraint, btree on `shopify_id`)

---

### `pages`

Represents printable pages, each containing multiple product cards.

| Column         | Type                        | Nullable | Default                             | Description                                                                 |
|----------------|-----------------------------|----------|-------------------------------------|-----------------------------------------------------------------------------|
| `id`           | integer                     | NOT NULL | nextval sequence                    | Unique identifier for the page entry.                                       |
| `name`         | text                        | NOT NULL |                                     | Name of the page (often generated with vendor/timestamp).                   |
| `type`         | text                        | YES      | 'auto'::text                        | Type of page (e.g., auto, manual).                                          |
| `status`       | text                        | YES      | 'ready'::text                       | Status of the page (e.g., ready, downloaded, printed).                      |
| `card_ids`     | text                        | YES      | '[]'::text                          | JSON array (stored as text) of `product_cards` IDs belonging to this page. |
| `pdf_url`      | text                        | YES      |                                     | URL if a PDF was generated and stored.                                      |
| `custom_data`  | text                        | YES      | '{}'::text                           | JSON stored as text (legacy?), for vendor info, sync details etc.           |
| `metrics`      | text                        | YES      | '{"totalScans": 0, ...}'::text    | JSON stored as text (legacy?), for tracking scans, prints, downloads.     |
| `created_at`   | timestamp without time zone | YES      | CURRENT_TIMESTAMP                   | Timestamp of creation.                                                      |
| `updated_at`   | timestamp without time zone | YES      | CURRENT_TIMESTAMP                   | Timestamp of last update.                                                   |
| `printed_at`   | timestamp without time zone | YES      |                                     | Timestamp when this page was printed.                                       |
| `printed_by`   | text                        | YES      |                                     | Identifier of who printed the page.                                         |
| `downloaded_at`| timestamp without time zone | YES      |                                     | Timestamp when this page was downloaded.                                    |
| `downloaded_by`| text                        | YES      |                                     | Identifier of who downloaded the page.                                      |
| `queue_id`     | integer                     | YES      |                                     | Foreign key linking to the `queues` table.                                  |

**Indexes:**
*   `pages_pkey` (Primary Key, btree on `id`)
*   `idx_pages_status` (btree on `status`)
*   `idx_pages_type` (btree on `type`)

**Check Constraints:**
*   `ensure_card_ids_json`: Ensures `card_ids` is NULL or a valid JSON array.

---

### `queues`

Represents a collection of pages, often grouped by vendor or sync batch.

| Column        | Type                        | Nullable | Default                             | Description                                                         |
|---------------|-----------------------------|----------|-------------------------------------|---------------------------------------------------------------------|
| `id`          | integer                     | NOT NULL | nextval sequence                    | Unique identifier for the queue entry.                              |
| `name`        | text                        | NOT NULL |                                     | Name of the queue (often generated with vendor/timestamp).          |
| `status`      | text                        | YES      | 'pending'::text                     | Status of the queue (e.g., pending, processed).                     |
| `page_ids`    | text                        | YES      | '[]'::text                          | JSON array (stored as text) of `pages` IDs belonging to this queue. |
| `custom_data` | text                        | YES      | '{}'::text                           | JSON stored as text (legacy?), for vendor info, sync details etc.   |
| `metrics`     | text                        | YES      | '{"totalPages": 0, ...}'::text    | JSON stored as text (legacy?), for tracking page/card counts.     |
| `created_at`  | timestamp without time zone | YES      | CURRENT_TIMESTAMP                   | Timestamp of creation.                                              |
| `updated_at`  | timestamp without time zone | YES      | CURRENT_TIMESTAMP                   | Timestamp of last update.                                           |
| `processed_at`| timestamp without time zone | YES      |                                     | Timestamp when this queue was marked as processed.                  |
| `processed_by`| text                        | YES      |                                     | Identifier of who processed the queue.                              |

**Indexes:**
*   `queues_pkey` (Primary Key, btree on `id`)
*   `idx_queues_status` (btree on `status`)

---

### `sync_logs`

Stores records of synchronization operations performed by the application or scripts.

| Column      | Type                     | Nullable | Default                 | Description                                                                                           |
|-------------|--------------------------|----------|-------------------------|-------------------------------------------------------------------------------------------------------|
| `id`        | integer                  | NOT NULL | nextval sequence        | Unique identifier for the log entry.                                                                  |
| `vendor_name` | text                     | NOT NULL |                         | The name of the vendor the sync was performed for. For global syncs, log entries might be per-vendor. |
| `run_at`    | timestamp with time zone | YES      | `now()`                 | Timestamp when the sync operation was logged (typically marks the end).                               |
| `status`    | text                     | NOT NULL |                         | Overall status of the sync operation (e.g., 'SUCCESS', 'FAILURE', 'PARTIAL').                      |
| `summary`   | text                     | YES      |                         | A brief, human-readable summary of the sync result.                                                   |
| `details`   | jsonb                    | NOT NULL |                         | Structured JSON data containing detailed results (e.g., counts, error messages). See PRDs for format. |
| `created_by`| text                     | YES      |                         | Identifier for the process or user that initiated the sync (e.g., 'manual_sync_button').          |
| `duration_ms` | integer                  | YES      |                         | Duration of the sync operation in milliseconds.                                                       |

**Indexes:**
*   `sync_logs_pkey` (Primary Key, btree on `id`)
