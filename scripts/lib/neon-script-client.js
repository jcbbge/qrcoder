import 'dotenv/config';
import pg from 'pg'; // Import the node-postgres library

// --- Neon DB Connection Pool ---
const { Pool } = pg;
let pool;

try {
  // Use DATABASE_URL from .env if available, otherwise fallback to individual vars
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('[Neon Script Client] Warning: DATABASE_URL not found in .env. Attempting individual connection variables (PGHOST, PGDATABASE, PGUSER, PGPASSWORD, PGPORT).');
    // Ensure required individual variables are present if DATABASE_URL is missing
    if (!process.env.PGHOST || !process.env.PGDATABASE || !process.env.PGUSER || !process.env.PGPASSWORD) {
       throw new Error('Missing required Neon DB connection details in .env (DATABASE_URL or PGHOST/PGDATABASE/PGUSER/PGPASSWORD).');
    }
  }

  pool = new Pool({
    connectionString: connectionString, // pg automatically uses individual env vars if connectionString is undefined
    // Optional: Add SSL configuration if required for Neon and not included in DATABASE_URL
    // ssl: {
    //   rejectUnauthorized: false // Adjust as per your security requirements
    // }
  });

  // Test the connection on startup (optional but recommended)
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('🚨 [Neon] Initial connection test failed:', err);
    } else {
      console.log(`[Neon] Successfully connected. Server time: ${res.rows[0].now}`);
    }
  });

} catch (error) {
  console.error('🚨 [Neon] Failed to initialize connection pool:', error);
  // Prevent scripts from running if the pool can't be created
  throw error;
}

/**
 * Executes a SQL query using the connection pool.
 * This is a general-purpose query function.
 *
 * @param {string} text - The SQL query text (use $1, $2 for parameters).
 * @param {Array} [params=[]] - An array of parameters for the query.
 * @returns {Promise<QueryResult>} The result object from node-postgres.
 * @throws {Error} If the query fails.
 */
export async function query(text, params = []) {
  if (!pool) {
    throw new Error('[Neon] Connection pool is not initialized.');
  }
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[Neon] DB query OK (rows: ${res.rowCount}, time: ${duration}ms)`);
    return res;
  } catch (error) {
    console.error('[Neon] Error executing query:', error.message, '| query:', text.substring(0, 100));
    throw error;
  }
}

/**
 * Fetches product cards from the database matching the given Shopify Product IDs.
 *
 * @export
 * @param {string[]} shopifyProductIds - An array of Shopify Product GIDs (e.g., 'gid://shopify/Product/123').
 * @returns {Promise<object[]>} An array of product card rows (id, name, created_at, shopify_product_id).
 * @throws {Error} If the query fails.
 */
export async function getProductCardsByShopifyIds(shopifyProductIds) {
  if (!shopifyProductIds || shopifyProductIds.length === 0) {
    return []; // No IDs to query
  }

  console.log(`[Neon] Querying product_cards for ${shopifyProductIds.length} Shopify IDs...`);

  const sql = `
    SELECT id, product_name, created_at, shopify_id
    FROM product_cards
    WHERE shopify_id = ANY($1::text[])
  `;

  try {
    const result = await query(sql, [shopifyProductIds]);
    console.log(`[Neon] Found ${result.rowCount} matching product cards.`);
    return result.rows;
  } catch (error) {
    console.error(`[Neon] Error in getProductCardsByShopifyIds:`, error.message);
    // Re-throw the error so the calling script knows it failed
    throw error;
  }
}

// Optional: Add functions for pages and queues here if needed later
// export async function getPagesByProductCardIds(productCardIds) { ... }
// export async function getQueuesByPageIds(pageIds) { ... }

// Optional: Export the pool itself if direct access is needed by some scripts
// export { pool };
