/**
 * Neon PostgreSQL DB interface for QR Coder
 * Connects to an existing Neon database
 *
 * ⚠️ IMPORTANT DATABASE NAMING CONVENTIONS ⚠️
 *
 * PostgreSQL Case-Sensitivity Rules:
 * 1. Unquoted identifiers (table names, column names) are ALWAYS folded to lowercase
 *    Example: onlineStoreUrl becomes onlinestoreurl (WRONG!)
 *
 * 2. To preserve case-sensitivity, ALWAYS use double quotes
 *    Example: "onlineStoreUrl" stays as onlineStoreUrl (CORRECT!)
 *
 * Our Convention:
 * - We use camelCase for columns that match Shopify's API fields (e.g., onlineStoreUrl)
 * - These MUST be quoted in ALL SQL queries: "onlineStoreUrl"
 * - We use snake_case for our own columns (e.g., created_at, updated_at)
 * - Snake_case columns don't need quotes
 *
 * Current camelCase columns that MUST be quoted:
 * - "onlineStoreUrl" - Matches Shopify's Product.onlineStoreUrl field
 *
 * Example SQL:
 * ✅ CORRECT: INSERT INTO product_cards ("onlineStoreUrl") VALUES ($1)
 * ❌ WRONG:   INSERT INTO product_cards (onlineStoreUrl) VALUES ($1)
 *
 * If you get error: column "onlinestoreurl" does not exist
 * It means you forgot to quote a camelCase column name!
 */

import pg from 'pg';

// Use the connection string from env or the direct connection for prototype
const DATABASE_URL = process.env.DATABASE_URL ||
  (() => { throw new Error('DATABASE_URL environment variable is required'); })();

// Create a PostgreSQL client
const pool = new pg.Pool({
  connectionString: DATABASE_URL
});

// Product Cards Interface
export const productCards = {
  async createProductCard(data) {
    const query = `
      INSERT INTO product_cards (
        shopify_id,
        product_name,
        artist_name,
        price,
        image_url,
        "onlineStoreUrl",
        status,
        custom_data,
        metrics,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const values = [
      data.shopify_id || data.id,
      data.product_name || data.title,
      data.artist_name || data.vendor,
      data.price?.toString() || '0.00',
      data.image_url || data.imageUrl || null,
      data.onlineStoreUrl || null,
      data.status || 'unprocessed',
      JSON.stringify(data.custom_data || {}),
      JSON.stringify(data.metrics || { scanCount: 0, lastScanAt: null })
    ];

    try {
      const result = await execute(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('[DB] Failed to create product card:', error);
      throw error;
    }
  },

  async getAllProductCards() {
    try {
      const query = `
        SELECT * FROM product_cards
        ORDER BY created_at DESC
      `;
      const result = await execute(query);
      return result.rows;
    } catch (error) {
      console.error('[DB] Error getting product cards:', error);
      throw error;
    }
  },

  async getProductCardsByShopifyIds(shopifyIds) {
    try {
      const params = shopifyIds.map((_, i) => `$${i + 1}`).join(',');
      const query = `
        SELECT * FROM product_cards
        WHERE shopify_id IN (${params})
        ORDER BY created_at DESC
      `;

      const result = await execute(query, shopifyIds);
      return result.rows;
    } catch (error) {
      console.error('[DB] Error getting product cards by Shopify IDs:', error);
      return [];
    }
  },

  async createProductCardsBulk(products) {

    try {
      const client = await pool.connect();
      const cards = [];

      try {
        await client.query('BEGIN');

        for (const product of products) {
          const query = `
            INSERT INTO product_cards (
              shopify_id,
              product_name,
              artist_name,
              price,
              image_url,
              online_store_url,
              status,
              custom_data,
              metrics,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *
          `;

          const values = [
            product.shopify_id || product.id,
            product.product_name || product.title,
            product.artist_name || product.vendor,
            product.price?.toString() || '0.00',
            product.image_url || product.imageUrl || null,
            product.online_store_url || product.onlineStoreUrl || null,
            product.status || 'unprocessed',
            JSON.stringify(product.custom_data || {}),
            JSON.stringify(product.metrics || { scanCount: 0, lastScanAt: null })
          ];

          try {
            const result = await client.query(query, values);
            cards.push(result.rows[0]);
          } catch (error) {
            console.error('[DB] Failed to create individual card in bulk:', {
              shopify_id: product.shopify_id || product.id,
              error: error.message
            });
            throw error;
          }
        }

        await client.query('COMMIT');
        return cards;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('[DB] Error in bulk creation, rolling back:', error);
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[DB] Error creating product cards in bulk:', error);
      throw error;
    }
  },

  async updatePosition(data) {
    const cardIds = data.cardIds || [data.card_id];
    const status = data.status || (data.page_id ? 'assigned' : 'unprocessed');
    const query = `UPDATE product_cards SET page_id = $1, page_position = $2, status = $3 WHERE id = ANY($4::int[]) RETURNING *`;
    return (await execute(query, [data.page_id, data.position, status, cardIds])).rows[0];
  },

  async markDownloaded(cardIds) {
    if (!cardIds || cardIds.length === 0) {
      return 0;
    }
    try {
      const query = `
        UPDATE product_cards
        SET status = 'printed', downloaded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::text[])
      `;
      const result = await execute(query, [cardIds.map(id => String(id))]); // Ensure IDs are strings
      return result.rowCount;
    } catch (error) {
      console.error('[DB] Error marking product cards as downloaded:', error);
      throw error; // Re-throw to allow handler to catch
    }
  },

  async getProductCardsByVendor(vendorName) {

    const query = `
      SELECT * FROM product_cards
      WHERE artist_name = $1
      ORDER BY created_at DESC
    `;

    try {
      const result = await execute(query, [vendorName]);
      return result.rows;
    } catch (error) {
      console.error('🚨 [DB] Error fetching product cards by vendor:', error);
      throw error;
    }
  },

  async updateProductCard(cardId, data) {
    const query = `UPDATE product_cards SET product_name = $1, artist_name = $2, price = $3 WHERE id = $4 RETURNING *`;
    return (await execute(query, [data.product_name, data.artist_name, data.price, cardId])).rows[0];
  },
};

// Pages Interface
export const pages = {
  async createPage(data) {
    const query = `
      INSERT INTO pages (
        name,
        type,
        status,
        card_ids,
        custom_data,
        metrics,
        queue_id,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING *
    `;

    const values = [
      data.name || `Page ${new Date().toISOString()}`,
      data.type || 'auto',
      data.status || 'ready',
      data.card_ids || '[]',
      data.custom_data || '{}',
      data.metrics || '{"totalScans": 0, "printCount": 0, "downloadCount": 0}',
      data.queue_id || null,
    ];

    const result = await execute(query, values);
    return result.rows[0];
  },

  async findAvailablePage(cardsPerPage = 10) {
    try {
      // Get pages with card_ids array that has fewer than cardsPerPage items
      const query = `
        SELECT * FROM pages
        WHERE status = 'ready'
        ORDER BY created_at DESC
      `;

      const result = await execute(query);

      // Find first page with available space
      for (const page of result.rows) {
        try {
          // Parse the card_ids JSON array
          const cardIds = JSON.parse(page.card_ids || '[]');

          // If this page has space available
          if (cardIds.length < cardsPerPage) {
            return { page, availableSlots: cardsPerPage - cardIds.length };
          }
        } catch (parseError) {
          console.error('[DB] Error parsing card_ids for page', page.id, ':', parseError);
          // Continue checking other pages
        }
      }

      // No page with available space found

      // Create a new page as fallback
      const newPage = await this.createPage({
        status: 'ready',
        card_ids: '[]'
      });

      return { page: newPage, availableSlots: cardsPerPage };
    } catch (error) {
      console.error('[DB] Error finding available page:', error);
      throw error;
    }
  },

  async createAutoPagesFromUnprocessedCards(cardsPerPage = 10) {
    // Create a new page
    const createPageQuery = `
      INSERT INTO pages (status, created_at)
      VALUES ('pending', NOW())
      RETURNING *
    `;
    const pageResult = await execute(createPageQuery);
    const page = pageResult.rows[0];

    // Get unprocessed cards
    const cardsQuery = `
      SELECT * FROM product_cards
      WHERE status = 'unprocessed'
      LIMIT $1
    `;
    const cardsResult = await execute(cardsQuery, [cardsPerPage]);

    // Associate cards with the page by updating card_ids
    if (cardsResult.rows.length > 0) {
      const cardIds = cardsResult.rows.map(card => card.id);

      // Update the page's card_ids array
      const updatePageQuery = `
        UPDATE pages
        SET card_ids = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      await execute(updatePageQuery, [JSON.stringify(cardIds), page.id]);

      // Update each card's status to assigned
      const updateCardQuery = `
        UPDATE product_cards
        SET status = 'assigned', page_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2::int[])
        RETURNING *
      `;

      await execute(updateCardQuery, [page.id, cardIds]);
    }

    const result = [{ ...page, cards: cardsResult.rows }];
    return result;
  },

  async getAllPages() {
    try {
      const query = `
        SELECT id, name, card_ids, created_at, updated_at, status, queue_id
        FROM pages
        ORDER BY created_at DESC
      `;
      const result = await execute(query);

      // Add better logging for debugging
      if (result.rows.length > 0) {
      }

      return result.rows;
    } catch (error) {
      console.error('[DB] Error fetching all pages:', error);
      // Return empty array instead of throwing to prevent app crash
      return [];
    }
  },

  async getPagesByQueueId(queueId) {
    try {
      const query = `
        SELECT id, name, card_ids, created_at, updated_at, status, queue_id
        FROM pages
        WHERE queue_id = $1
        ORDER BY created_at DESC
      `;
      const result = await execute(query, [queueId]);

      // Add better logging for debugging
      if (result.rows.length > 0) {
      } else {
      }

      return result.rows;
    } catch (error) {
      console.error(`[DB] Error fetching pages for queue_id ${queueId}:`, error);
      // Return empty array instead of throwing to prevent app crash
      return [];
    }
  },

  async markDownloaded(pageIds) {
    if (!pageIds || pageIds.length === 0) {
      return { updatedPages: [], cardIdsToUpdate: [] };
    }
    try {
      const query = `
        UPDATE pages
        SET status = 'done', downloaded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::int[])
        RETURNING id, status, downloaded_at, card_ids
      `;
      const result = await execute(query, [pageIds]);

      // Extract card IDs from updated pages
      let cardIdsToUpdate = [];
      for (const page of result.rows) {
        try {
          const cardIds = JSON.parse(page.card_ids || '[]');
          cardIdsToUpdate.push(...cardIds);
        } catch (e) {
          console.warn(`[DB] Error parsing card_ids for page ${page.id} during markDownloaded: ${e.message}`);
        }
      }
      cardIdsToUpdate = [...new Set(cardIdsToUpdate)]; // Unique IDs

      return {
        updatedPages: result.rows,
        cardIdsToUpdate: cardIdsToUpdate
      };
    } catch (error) {
      console.error('[DB] Error marking pages as downloaded:', error);
      throw error; // Re-throw
    }
  },

  async updateQueueAssignment(pageIds, queueId) {
    const query = `UPDATE pages SET queue_id = $1 WHERE id = ANY($2::int[]) RETURNING *`;
    return (await execute(query, [queueId, pageIds])).rows;
  },

  async updatePage(pageId, data) {
    const query = `UPDATE pages SET name = $1, card_ids = $2, custom_data = $3 WHERE id = $4 RETURNING *`;
    return (await execute(query, [data.name, JSON.stringify(data.card_ids), JSON.stringify(data.custom_data), pageId])).rows[0];
  },
};

// Queues Interface
export const queues = {
  async createQueue(data) {

    const query = `
      INSERT INTO queues (name, status, custom_data, created_at)
      VALUES ($1, 'pending', $2, NOW())
      RETURNING *
    `;

    const values = [
      data.name,
      data.custom_data || '{}'
    ];

    const result = await execute(query, values);

    return result.rows[0];
  },

  async getAllQueues() {
    try {
      const query = `
        SELECT id, name, created_at, updated_at, status, custom_data
        FROM queues
        ORDER BY created_at DESC
      `;
      const result = await execute(query);
      return result.rows;
    } catch (error) {
      console.error('[DB] Error fetching all queues:', error);
      return [];
    }
  },

  async markProcessed(queueId) {
    if (!queueId) {
      return null;
    }
    try {
      const query = `
        UPDATE queues
        SET status = 'processed', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, status, processed_at
      `;
      const result = await execute(query, [queueId]);
      if (result.rowCount === 0) {
        console.warn(`[DB] Queue ${queueId} not found for marking as processed.`);
        return null;
      }
      return result.rows[0];
    } catch (error) {
      console.error(`[DB] Error marking queue ${queueId} as processed:`, error);
      throw error; // Re-throw
    }
  }
};

// Modify execute function to include validation
export async function execute(query, params = []) {
  try {
    const result = await pool.query(query, params);
    return result;
  } catch (error) {
    console.error('[NEON-DB] Query failed:', {
      error: error.message,
      code: error.code,
      detail: error.detail,
      timestamp: new Date().toISOString(),
      query: query.replace(/\s+/g, ' ').trim(),
      params: params
    });
    throw error;
  }
}
