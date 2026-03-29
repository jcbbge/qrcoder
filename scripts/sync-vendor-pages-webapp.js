/**
 * [WEBAPP VERSION] Sync Shopify products to our database and create pages/queues
 *
 * STRICT FLOW:
 * 1. Get Shopify products
 * 2. For each product:
 *    - Check if exists in DB
 *    - If new: Create product_card
 *    - If exists: Check if updated
 * 3. Create/Update pages with synced products
 * 4. Create queue for new/updated pages
 */

import 'dotenv/config';
import { getAllShopifyVendors, getShopifyProductsByVendorPaginated } from './lib/shopify-script-client.js';
import { query as dbQuery } from './lib/neon-script-client.js';

const MAX_PRODUCTS_PER_PAGE = 10;

export async function runSync(options) {
  const { vendorName: targetVendor, triggeredBy = 'webapp' } = options;
  const startTime = Date.now();
  const summary = {
    totalVendors: 0,
    totalNewProducts: 0,
    totalUpdatedProducts: 0,
    totalNewPages: 0,
    totalNewQueues: 0,
    processedVendors: 0,
    errors: 0,
    createdProducts: [],
    updatedProducts: [],
    createdPages: [],
    createdQueues: []
  };

  try {
    if (targetVendor) {
      // Single vendor case
      summary.totalVendors = 1;
      await processVendor(targetVendor, summary, triggeredBy);
      summary.processedVendors++;
    } else {
      // All vendors case
      const vendors = await getAllShopifyVendors();
      summary.totalVendors = vendors.length;
      for (const vendor of vendors) {
        try {
          await processVendor(vendor, summary, triggeredBy);
          summary.processedVendors++;
        } catch (error) {
          summary.errors++;
          console.error(`Error processing vendor ${vendor}:`, error);
          // Continue with next vendor
        }
      }
    }

    return {
      status: summary.errors ? (summary.errors === summary.totalVendors ? 'FAILURE' : 'PARTIAL') : 'SUCCESS',
      summary: `${summary.totalNewProducts} new products, ${summary.totalUpdatedProducts} updated across ${summary.processedVendors} vendors`,
      details: {
        counts: {
          vendors_total: summary.totalVendors,
          vendors_processed: summary.processedVendors,
          vendors_failed: summary.errors,
          products_created: summary.totalNewProducts,
          products_updated: summary.totalUpdatedProducts,
          pages_created: summary.totalNewPages,
          queues_created: summary.totalNewQueues
        },
        operations: [
          ...summary.createdProducts.map(p => ({ type: 'product_created', ...p })),
          ...summary.updatedProducts.map(p => ({ type: 'product_updated', ...p })),
          ...summary.createdPages.map(p => ({ type: 'page_created', ...p })),
          ...summary.createdQueues.map(q => ({ type: 'queue_created', ...q }))
        ]
      }
    };
  } catch (error) {
    summary.errors++;
    throw error;
  }
}

async function processVendor(vendorName, summary, triggeredBy) {
  const vendorStartTime = Date.now();
  const vendorSummary = {
    createdProducts: [],
    updatedProducts: [],
    createdPages: [],
    createdQueues: []
  };

  try {
    // 1. Get Shopify products
    const { products } = await getShopifyProductsByVendorPaginated(vendorName);
    if (!products.length) {
      // Skip log for no products
      return;
    }

    // 2. Process each product
    const syncedProducts = await Promise.all(
      products.map(product => syncProduct(product, vendorSummary))
    );

    const newProducts = syncedProducts.filter(p => p.isNew);
    const updatedProducts = syncedProducts.filter(p => p.isUpdated);

    if (!newProducts.length && !updatedProducts.length) {
      // Skip log for no changes
      return;
    }

    // 3. Create/Update pages
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const cardIds = [...newProducts, ...updatedProducts].map(p => p.id);
    const pageIds = await createPages(vendorName, cardIds, timestamp, vendorSummary);

    // 4. Create queue for the pages
    let queueId = null;
    if (pageIds.length) {
      queueId = await createQueue(vendorName, pageIds, timestamp, vendorSummary);
    }

    // Update global summary
    summary.totalNewProducts += newProducts.length;
    summary.totalUpdatedProducts += updatedProducts.length;
    summary.totalNewPages += pageIds.length;
    summary.totalNewQueues += pageIds.length ? 1 : 0;
    summary.createdProducts.push(...vendorSummary.createdProducts);
    summary.updatedProducts.push(...vendorSummary.updatedProducts);
    summary.createdPages.push(...vendorSummary.createdPages);
    summary.createdQueues.push(...vendorSummary.createdQueues);

    // Only create sync log if we had actual changes
    const durationMs = Date.now() - vendorStartTime;
    const summaryString = `${vendorSummary.createdProducts.length} new products, ${vendorSummary.updatedProducts.length} updated, ${vendorSummary.createdPages.length} new pages, ${vendorSummary.createdQueues.length} new queues`;
    const details = {
      counts: {
        products_created: vendorSummary.createdProducts.length,
        products_updated: vendorSummary.updatedProducts.length,
        pages_created: vendorSummary.createdPages.length,
        queues_created: vendorSummary.createdQueues.length
      },
      operations: [
        ...vendorSummary.createdProducts.map(p => ({ type: 'product_created', id: p.id, name: p.name, price: p.price, shopify_id: p.shopify_id, timestamp: p.timestamp })),
        ...vendorSummary.updatedProducts.map(p => ({ type: 'product_updated', id: p.id, name: p.name, price: p.price, shopify_id: p.shopify_id, timestamp: p.timestamp })),
        ...vendorSummary.createdPages.map(p => ({ type: 'page_created', id: p.id, name: p.name, timestamp: p.timestamp })),
        ...vendorSummary.createdQueues.map(q => ({ type: 'queue_created', id: q.id, name: q.name, timestamp: q.timestamp }))
      ]
    };

    await dbQuery(
      `INSERT INTO sync_logs (vendor_name, status, summary, details, created_by, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        vendorName,
        'SUCCESS',
        summaryString,
        details,
        triggeredBy,
        durationMs
      ]
    );

    return {
      status: 'SUCCESS',
      summary: summaryString,
      details
    };

  } catch (error) {
    // Still log errors
    const errorDetails = {
      error: error.message,
      timestamp: new Date().toISOString()
    };

    await dbQuery(
      `INSERT INTO sync_logs (vendor_name, status, summary, details, created_by, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        vendorName,
        'FAILURE',
        'Error syncing vendor products',
        errorDetails,
        triggeredBy,
        Date.now() - vendorStartTime
      ]
    );

    throw error;
  }
}

async function syncProduct(shopifyProduct, summary) {
  // Check if product exists
  const existing = await dbQuery(
    'SELECT * FROM product_cards WHERE shopify_id = $1',
    [shopifyProduct.id]
  );

  const currentPrice = shopifyProduct.priceRangeV2?.minVariantPrice?.amount?.toString() || '0';

  if (!existing.rows.length) {
    // Create new product
    const customData = { syncSource: 'shopify', lastSync: new Date().toISOString() };
    const metrics = { scanCount: 0, lastScanAt: null };

    const result = await dbQuery(
      `INSERT INTO product_cards (
        shopify_id, product_name, artist_name, price,
        image_url, "onlineStoreUrl", status,
        custom_data, metrics
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        shopifyProduct.id,
        shopifyProduct.title,
        shopifyProduct.vendor,
        currentPrice,
        shopifyProduct.featuredImage?.url,
        shopifyProduct.onlineStoreUrl,
        'unassigned',
        JSON.stringify(customData),
        JSON.stringify(metrics)
      ]
    );

    summary.createdProducts.push({
      id: result.rows[0].id,
      name: result.rows[0].product_name,
      price: result.rows[0].price,
      shopify_id: result.rows[0].shopify_id,
      timestamp: result.rows[0].created_at || customData.lastSync,
      message: `Created product: ${result.rows[0].product_name} (Shopify ID: ${result.rows[0].shopify_id}, Price: ${result.rows[0].price})`
    });

    return { id: result.rows[0].id, isNew: true };
  }

  const dbProduct = existing.rows[0];
  const customData = JSON.parse(dbProduct.custom_data || '{}');

  const needsUpdate =
    dbProduct.product_name !== shopifyProduct.title ||
    dbProduct.artist_name !== shopifyProduct.vendor ||
    dbProduct.price !== currentPrice ||
    dbProduct['onlineStoreUrl'] !== shopifyProduct.onlineStoreUrl;

  if (needsUpdate) {
    const updatedCustomData = {
      ...customData,
      lastSync: new Date().toISOString()
    };

    const updateResult = await dbQuery(
      `UPDATE product_cards
       SET product_name = $1,
           artist_name = $2,
           price = $3,
           "onlineStoreUrl" = $4,
           custom_data = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        shopifyProduct.title,
        shopifyProduct.vendor,
        currentPrice,
        shopifyProduct.onlineStoreUrl,
        JSON.stringify(updatedCustomData),
        dbProduct.id
      ]
    );

    summary.updatedProducts.push({
      id: updateResult.rows[0].id,
      name: updateResult.rows[0].product_name,
      price: updateResult.rows[0].price,
      shopify_id: updateResult.rows[0].shopify_id,
      timestamp: updateResult.rows[0].updated_at || updatedCustomData.lastSync,
      message: `Updated product: ${updateResult.rows[0].product_name} (Shopify ID: ${updateResult.rows[0].shopify_id}, Price: ${updateResult.rows[0].price})`
    });

    return { id: dbProduct.id, isUpdated: true };
  }

  return { id: dbProduct.id, isUpdated: false };
}

async function createPages(vendorName, cardIds, timestamp, summary) {
  const pageIds = [];
  let remainingCards = [...cardIds];

  while (remainingCards.length) {
    const pageCardIds = remainingCards.slice(0, MAX_PRODUCTS_PER_PAGE);
    remainingCards = remainingCards.slice(MAX_PRODUCTS_PER_PAGE);

    const result = await dbQuery(
      `INSERT INTO pages (
        name, type, status, card_ids, custom_data
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        `${vendorName}_${timestamp}`,
        'auto',
        'ready',
        JSON.stringify(pageCardIds),
        JSON.stringify({
          vendorName,
          syncTimestamp: timestamp,
          syncType: 'bulk'
        })
      ]
    );

    const page = result.rows[0];
    const pageId = page.id;
    pageIds.push(pageId);

    const cards = await dbQuery(
      'SELECT id, custom_data FROM product_cards WHERE id = ANY($1)',
      [pageCardIds]
    );

    for (const card of cards.rows) {
      const customData = JSON.parse(card.custom_data || '{}');
      await dbQuery(
        `UPDATE product_cards
         SET status = 'assigned',
             page_id = $1,
             custom_data = $2
         WHERE id = $3`,
        [
          pageId,
          JSON.stringify({
            ...customData,
            pageAssignment: { timestamp, pageId }
          }),
          card.id
        ]
      );
    }

    summary.createdPages.push({
      id: page.id,
      name: page.name,
      timestamp: page.created_at || timestamp,
      message: `Created page: ${page.name} (ID: ${page.id})`
    });
  }

  return pageIds;
}

async function createQueue(vendorName, pageIds, timestamp, summary) {
  const result = await dbQuery(
    `INSERT INTO queues (
      name, status, page_ids, custom_data
    ) VALUES ($1, $2, $3, $4)
    RETURNING *`,
    [
      `${vendorName}_${timestamp}`,
      'pending',
      JSON.stringify(pageIds),
      JSON.stringify({
        vendorName,
        syncTimestamp: timestamp,
        pageCount: pageIds.length,
        syncType: 'bulk'
      })
    ]
  );

  const queueRecord = result.rows[0];
  const queueId = queueRecord.id;

  const pages = await dbQuery(
    'SELECT id, custom_data FROM pages WHERE id = ANY($1)',
    [pageIds]
  );

  for (const page of pages.rows) {
    const customData = JSON.parse(page.custom_data || '{}');
    await dbQuery(
      `UPDATE pages
       SET queue_id = $1,
           custom_data = $2
       WHERE id = $3`,
      [
        queueId,
        JSON.stringify({
          ...customData,
          queueAssignment: { timestamp, queueId }
        }),
        page.id
      ]
    );
  }

  summary.createdQueues.push({
    id: queueRecord.id,
    name: queueRecord.name,
    timestamp: queueRecord.created_at || timestamp,
    message: `Created queue: ${queueRecord.name} (ID: ${queueRecord.id})`
  });

  return queueId;
}
