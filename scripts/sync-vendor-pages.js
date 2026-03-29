/**
 * Sync Shopify products to our database and create pages/queues
 *
 * STRICT FLOW:
 * 1. Get Shopify products
 * 2. For each product:
 *    - Check if exists in our DB
 *    - If new: Create product_card
 *    - If exists: Check if updated, update if needed
 * 3. Create/Update pages with synced products
 * 4. Create queue for new/updated pages
 *
 * IMPORTANT NOTE ON SHOPIFY IDs:
 * This script always uses the GID format (gid://shopify/Product/1234567890) as received
 * from the Shopify API. We do not modify or strip these IDs. See DEV_NOTES.md for more
 * details about how our system handles different Shopify ID formats.
 *
 * Usage:
 *   node scripts/sync-vendor-pages.js           # Process all vendors
 *   node scripts/sync-vendor-pages.js "Vendor"  # Process single vendor
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { getAllShopifyVendors, getShopifyProductsByVendorPaginated } from './lib/shopify-script-client.js';
import { query as dbQuery } from './lib/neon-script-client.js';

const MAX_PRODUCTS_PER_PAGE = 10;

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Setup logging
function setupLogging(vendorName) {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const logName = vendorName
    ? `sync-${timestamp}-${vendorName.replace(/[^a-zA-Z0-9]/g, '_')}.log`
    : `sync-${timestamp}.log`;
  const logPath = path.join(logsDir, logName);

  // Create write stream for logging
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  // Capture console output
  const originalConsole = {
    log: console.log,
    error: console.error
  };

  // Override console methods to write to both stdout and log file
  console.log = (...args) => {
    const message = args.join(' ');
    originalConsole.log(message);
    logStream.write(message + '\n');
  };

  console.error = (...args) => {
    const message = args.join(' ');
    originalConsole.error(message);
    logStream.write('[ERROR] ' + message + '\n');
  };

  return () => {
    // Restore original console methods
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    logStream.end();
  };
}

async function main() {
  const startTime = Date.now();
  const summary = {
    totalVendors: 0,
    totalNewProducts: 0,
    totalUpdatedProducts: 0,
    totalNewPages: 0,
    totalNewQueues: 0,
    processedVendors: 0,
    errors: 0,
    createdProducts: [], // {id, name, timestamp}
    updatedProducts: [],
    createdPages: [],
    createdQueues: []
  };

  const targetVendor = process.argv[2];
  const cleanupLogging = setupLogging(targetVendor);

  try {
    if (targetVendor) {
      await processVendor(targetVendor, summary);
    } else {
      const vendors = await getAllShopifyVendors();
      summary.totalVendors = vendors.length;
      for (const vendor of vendors) {
        await processVendor(vendor, summary);
      }
    }
  } catch (error) {
    console.error('Error:', error);
    summary.errors++;
  } finally {
    printSummary(summary, startTime);
    cleanupLogging();
  }
}

async function processVendor(vendorName, summary) {
  const vendorStartTime = Date.now();
  console.log(`\n🔄 Processing ${vendorName}...`);
  console.log('----------------------------------------');

  // Track per-vendor details for sync log
  const vendorDetails = [];
  const vendorSummary = {
    createdProducts: [],
    updatedProducts: [],
    createdPages: [],
    createdQueues: []
  };

  try {
    // 1. Get Shopify products
    console.log('1️⃣ Fetching products from Shopify...');
    const { products } = await getShopifyProductsByVendorPaginated(vendorName);
    if (!products.length) {
      console.log(`❌ No products found for ${vendorName}`);
      return;
    }
    console.log(`✅ Found ${products.length} products`);

    // 2. Process each product
    console.log('\n2️⃣ Processing products...');
    const syncedProducts = await Promise.all(
      products.map(product => syncProduct(product, vendorSummary))
    );

    const newProducts = syncedProducts.filter(p => p.isNew);
    const updatedProducts = syncedProducts.filter(p => p.isUpdated);

    console.log(`✅ Processed ${products.length} products:`);
    console.log(`   - New products: ${newProducts.length}`);
    console.log(`   - Updated products: ${updatedProducts.length}`);

    if (!newProducts.length && !updatedProducts.length) {
      console.log('ℹ️ No changes needed');
      return;
    }

    // 3. Create/Update pages
    console.log('\n3️⃣ Creating pages...');
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const cardIds = [...newProducts, ...updatedProducts].map(p => p.id);

    const pageIds = await createPages(vendorName, cardIds, timestamp, vendorSummary);
    console.log(`✅ Created ${pageIds.length} pages`);

    // 4. Create queue for the pages
    if (pageIds.length) {
      console.log('\n4️⃣ Creating queue...');
      const queueId = await createQueue(vendorName, pageIds, timestamp, vendorSummary);
      console.log(`✅ Created queue #${queueId}`);
    }

    // Update global summary
    summary.totalNewProducts += newProducts.length;
    summary.totalUpdatedProducts += updatedProducts.length;
    summary.totalNewPages += pageIds.length;
    summary.totalNewQueues += pageIds.length ? 1 : 0;
    summary.processedVendors++;
    summary.createdProducts.push(...vendorSummary.createdProducts);
    summary.updatedProducts.push(...vendorSummary.updatedProducts);
    summary.createdPages.push(...vendorSummary.createdPages);
    summary.createdQueues.push(...vendorSummary.createdQueues);

    // --- SYNC LOGS DB INSERTION (per vendor) ---
    try {
      const durationMs = Date.now() - vendorStartTime;
      // Compose a concise summary string
      const summaryString = `${vendorSummary.createdProducts.length} new products, ${vendorSummary.updatedProducts.length} updated, ${vendorSummary.createdPages.length} new pages, ${vendorSummary.createdQueues.length} new queues`;
      // Compose details array
      const details = [];
      vendorSummary.createdProducts.forEach(p => details.push({ type: 'product_created', id: p.id, name: p.name, price: p.price, shopify_id: p.shopify_id, timestamp: p.timestamp, message: p.message }));
      vendorSummary.updatedProducts.forEach(p => details.push({ type: 'product_updated', id: p.id, name: p.name, price: p.price, shopify_id: p.shopify_id, timestamp: p.timestamp, message: p.message }));
      vendorSummary.createdPages.forEach(p => details.push({ type: 'page_created', id: p.id, name: p.name, timestamp: p.timestamp, message: p.message }));
      vendorSummary.createdQueues.forEach(q => details.push({ type: 'queue_created', id: q.id, name: q.name, timestamp: q.timestamp, message: q.message }));
      await dbQuery(
        `INSERT INTO sync_logs (vendor_name, status, summary, details, created_by, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          vendorName,
          'success',
          summaryString,
          JSON.stringify(details),
          'script',
          durationMs
        ]
      );
    } catch (err) {
      console.error('Failed to write sync log:', err);
    }
    // --- END SYNC LOGS DB INSERTION ---

    console.log('\n✨ Vendor processing complete!');
    console.log('----------------------------------------');

  } catch (error) {
    console.error(`\n❌ Error processing ${vendorName}:`, error);
    summary.errors++;
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
    console.log(`📦 NEW: ${shopifyProduct.title} by ${shopifyProduct.vendor}`);

    // DEBUG: Show what we're about to insert
    const customData = { syncSource: 'shopify', lastSync: new Date().toISOString() };
    const metrics = { scanCount: 0, lastScanAt: null };

    console.log('\n📝 INSERTING:');
    console.log('custom_data:', JSON.stringify(customData, null, 2));
    console.log('metrics:', JSON.stringify(metrics, null, 2));

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

    // DEBUG: Show what was actually saved
    console.log('\n💾 SAVED TO DB:');
    console.log(JSON.stringify(result.rows[0], null, 2));

    // Add to summary
    summary.createdProducts.push({
      id: result.rows[0].id,
      name: result.rows[0].product_name,
      price: result.rows[0].price,
      shopify_id: result.rows[0].shopify_id,
      timestamp: result.rows[0].created_at || customData.lastSync,
      message: `Created product: ${result.rows[0].product_name} (Shopify ID: ${result.rows[0].shopify_id}, Price: ${result.rows[0].price})`
    });
    return { id: result.rows[0].id, isNew: true, isUpdated: false };
  }

  const existingProduct = existing.rows[0];
  const customData = JSON.parse(existingProduct.custom_data || '{}');

  // DEBUG: Show existing data
  console.log('\n📂 EXISTING DB DATA:');
  console.log(JSON.stringify(existingProduct, null, 2));

  const needsUpdate =
    existingProduct.product_name !== shopifyProduct.title ||
    existingProduct.artist_name !== shopifyProduct.vendor ||
    existingProduct.price !== currentPrice ||
    existingProduct['onlineStoreUrl'] !== shopifyProduct.onlineStoreUrl;

  if (needsUpdate) {
    // Update existing product
    console.log(`🔄 UPDATE: ${shopifyProduct.title} by ${shopifyProduct.vendor}`);

    // DEBUG: Show what we're about to update
    const updatedCustomData = {
      ...customData,
      lastSync: new Date().toISOString()
    };

    console.log('\n✏️ UPDATING TO:');
    console.log('custom_data:', JSON.stringify(updatedCustomData, null, 2));

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
        existingProduct.id
      ]
    );

    // DEBUG: Show what was actually saved
    console.log('\n💾 UPDATED IN DB:');
    console.log(JSON.stringify(updateResult.rows[0], null, 2));

    // Add to summary
    summary.updatedProducts.push({
      id: updateResult.rows[0].id,
      name: updateResult.rows[0].product_name,
      price: updateResult.rows[0].price,
      shopify_id: updateResult.rows[0].shopify_id,
      timestamp: updateResult.rows[0].updated_at || updatedCustomData.lastSync,
      message: `Updated product: ${updateResult.rows[0].product_name} (Shopify ID: ${updateResult.rows[0].shopify_id}, Price: ${updateResult.rows[0].price})`
    });
    return { id: existingProduct.id, isNew: false, isUpdated: true };
  }

  return { id: existingProduct.id, isNew: false, isUpdated: false };
}

async function createPages(vendorName, cardIds, timestamp, summary) {
  console.log(`Creating pages for ${cardIds.length} products...`);
  const pageIds = [];
  let remainingCards = [...cardIds];

  while (remainingCards.length) {
    const pageCardIds = remainingCards.slice(0, MAX_PRODUCTS_PER_PAGE);
    remainingCards = remainingCards.slice(MAX_PRODUCTS_PER_PAGE);

    // JUST FUCKING STRINGIFY THE ARRAYS AND OBJECTS
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
    // Add to summary
    summary.createdPages.push({
      id: page.id,
      name: page.name,
      timestamp: page.created_at || timestamp,
      message: `Created page: ${page.name} (ID: ${page.id})`
    });
    console.log(`   Created page #${pageId} with ${pageCardIds.length} products`);

    // Update product cards
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
  }

  return pageIds;
}

async function createQueue(vendorName, pageIds, timestamp, summary) {
  // JUST FUCKING STRINGIFY EVERYTHING
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

  // Add to summary
  summary.createdQueues.push({
    id: queueRecord.id,
    name: queueRecord.name,
    timestamp: queueRecord.created_at || timestamp,
    message: `Created queue: ${queueRecord.name} (ID: ${queueRecord.id})`
  });

  // Log the full queue record for analysis
  console.log('\n🆕 FULL QUEUE RECORD:');
  console.log(JSON.stringify(queueRecord, null, 2));

  // Update pages
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

  return queueId;
}

function printSummary(summary, startTime) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(50));
  console.log('📊 FINAL SYNC SUMMARY');
  console.log('='.repeat(50));
  console.log(`Total Vendors Processed: ${summary.processedVendors}/${summary.totalVendors}`);
  console.log(`New Products Created: ${summary.totalNewProducts}`);
  if (summary.createdProducts.length) {
    console.log('  Created Products:');
    summary.createdProducts.forEach(p =>
      console.log(`    - id: ${p.id}, name: ${p.name}, timestamp: ${p.timestamp}`)
    );
  }
  console.log(`Existing Products Updated: ${summary.totalUpdatedProducts}`);
  if (summary.updatedProducts.length) {
    console.log('  Updated Products:');
    summary.updatedProducts.forEach(p =>
      console.log(`    - id: ${p.id}, name: ${p.name}, timestamp: ${p.timestamp}`)
    );
  }
  console.log(`New Pages Created: ${summary.totalNewPages}`);
  if (summary.createdPages.length) {
    console.log('  Created Pages:');
    summary.createdPages.forEach(p =>
      console.log(`    - id: ${p.id}, name: ${p.name}, timestamp: ${p.timestamp}`)
    );
  }
  console.log(`New Queues Created: ${summary.totalNewQueues}`);
  if (summary.createdQueues.length) {
    console.log('  Created Queues:');
    summary.createdQueues.forEach(q =>
      console.log(`    - id: ${q.id}, name: ${q.name}, timestamp: ${q.timestamp}`)
    );
  }
  console.log(`Errors Encountered: ${summary.errors}`);
  console.log(`Total Time: ${elapsed} seconds`);
  console.log('='.repeat(50));
}

// Run if called directly
if (process.argv[1].endsWith('sync-vendor-pages.js')) {
  main();
}
