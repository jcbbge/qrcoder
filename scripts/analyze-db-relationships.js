/**
 * Database Relationship Analysis Script
 *
 * Analyzes relationships between:
 * - Product Cards <-> Shopify Products (1:1)
 * - Product Cards <-> Pages (10:1 batching)
 * - Pages <-> Queues (10:1 batching)
 *
 * Usage:
 * node scripts/analyze-db-relationships.js             # Analyze all vendors
 * node scripts/analyze-db-relationships.js "Vendor Name" # Analyze specific vendor
 */

import 'dotenv/config';
import { query as dbQuery } from './lib/neon-script-client.js';
import { getAllShopifyVendors, getShopifyProductsByVendorPaginated } from './lib/shopify-script-client.js';

// Constants
const PRODUCTS_PER_PAGE = 10;
const PAGES_PER_QUEUE = 10;

async function analyzeProductCards(vendorName = null) {
  console.log(`\n🔍 Analyzing Product Cards${vendorName ? ` for vendor: ${vendorName}` : ''}...`);

  try {
    // Get product cards from database
    const dbProducts = await dbQuery(
      vendorName
        ? `SELECT id, shopify_id, product_name, artist_name, page_id, status
           FROM product_cards
           WHERE artist_name = $1
           ORDER BY artist_name, product_name`
        : `SELECT id, shopify_id, product_name, artist_name, page_id, status
           FROM product_cards
           ORDER BY artist_name, product_name`,
      vendorName ? [vendorName] : []
    );

    console.log(`📊 Found ${dbProducts.rows.length} Product Cards in database`);

    // Get Shopify products
    let shopifyProducts = [];
    if (vendorName) {
      const result = await getShopifyProductsByVendorPaginated(vendorName);
      shopifyProducts = result.products;
    } else {
      // For all vendors, we need to fetch each vendor's products
      const vendors = await getAllShopifyVendors();
      for (const vendor of vendors) {
        const result = await getShopifyProductsByVendorPaginated(vendor);
        shopifyProducts = shopifyProducts.concat(result.products);
      }
    }
    console.log(`📊 Found ${shopifyProducts.length} products in Shopify`);

    // Create lookup maps
    const shopifyProductMap = new Map(shopifyProducts.map(p => [p.id, p]));
    const dbProductMap = new Map(dbProducts.rows.map(p => [p.shopify_id, p]));

    // Find mismatches
    const missingInDb = shopifyProducts.filter(p => !dbProductMap.has(p.id));
    const missingInShopify = dbProducts.rows.filter(p => !shopifyProductMap.has(p.shopify_id));
    const orphanedCards = dbProducts.rows.filter(p => p.page_id && p.status === 'unassigned');

    console.log('\n📊 Product Card Analysis:');
    console.log(`- Missing in Database: ${missingInDb.length}`);
    console.log(`- Missing in Shopify: ${missingInShopify.length}`);
    console.log(`- Orphaned Cards (has page_id but unassigned): ${orphanedCards.length}`);

    if (missingInDb.length > 0) {
      console.log('\n❌ Products in Shopify but missing in Database:');
      missingInDb.forEach(p => console.log(`  - ${p.title} (${p.id}) by ${p.vendor}`));
    }

    if (missingInShopify.length > 0) {
      console.log('\n❌ Products in Database but missing in Shopify:');
      missingInShopify.forEach(p => console.log(`  - ${p.product_name} (${p.shopify_id}) by ${p.artist_name}`));
    }

    if (orphanedCards.length > 0) {
      console.log('\n⚠️ Orphaned Product Cards (inconsistent state):');
      orphanedCards.forEach(p => console.log(`  - ${p.product_name} (ID: ${p.id}, Page: ${p.page_id})`));
    }

    return dbProducts.rows;
  } catch (error) {
    console.error('❌ Error analyzing Product Cards:', error);
    throw error;
  }
}

async function analyzePages(productCards, vendorName = null) {
  console.log(`\n🔍 Analyzing Pages${vendorName ? ` for vendor: ${vendorName}` : ''}...`);

  try {
    // Get pages, filtering by vendor if specified
    const pages = await dbQuery(
      vendorName
        ? `SELECT id, name, status, card_ids, queue_id
           FROM pages
           WHERE (custom_data::jsonb)->>'vendorName' = $1
           ORDER BY id`
        : `SELECT id, name, status, card_ids, queue_id
           FROM pages
           ORDER BY id`,
      vendorName ? [vendorName] : []
    );
    console.log(`📊 Found ${pages.rows.length} Pages in database`);

    // Show page relationships
    console.log('\nPage Relationships:');
    for (const page of pages.rows) {
      const cardIds = JSON.parse(page.card_ids || '[]');
      console.log(`P[${page.id}]: [${cardIds.join(', ')}] [${cardIds.length}]`);
    }

    return pages.rows;
  } catch (error) {
    console.error('❌ Error analyzing Pages:', error);
    throw error;
  }
}

async function analyzeQueues(pages, vendorName = null) {
  console.log(`\n🔍 Analyzing Queues${vendorName ? ` for vendor: ${vendorName}` : ''}...`);

  try {
    // Get queues, filtering by vendor if specified
    const queues = await dbQuery(
      vendorName
        ? `SELECT id, name, status, page_ids, metrics
           FROM queues
           WHERE (custom_data::jsonb)->>'vendorName' = $1
           ORDER BY id`
        : `SELECT id, name, status, page_ids, metrics
           FROM queues
           ORDER BY id`,
      vendorName ? [vendorName] : []
    );
    console.log(`📊 Found ${queues.rows.length} Queues in database`);

    // Show queue relationships
    console.log('\nQueue Relationships:');
    for (const queue of queues.rows) {
      const pageIds = JSON.parse(queue.page_ids || '[]');
      console.log(`Q[${queue.id}]: [${pageIds.join(', ')}] [${pageIds.length}]`);
    }

  } catch (error) {
    console.error('❌ Error analyzing Queues:', error);
    throw error;
  }
}

async function main() {
  const vendorName = process.argv[2];

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage:
  node scripts/analyze-db-relationships.js             # Analyze all vendors
  node scripts/analyze-db-relationships.js "Vendor Name" # Analyze specific vendor
    `);
    process.exit(0);
  }

  console.log('🔍 Starting Database Relationship Analysis');
  console.log('==========================================');
  if (vendorName) {
    console.log(`📋 Analyzing vendor: "${vendorName}"`);
  }

  try {
    // Analyze in sequence, passing data forward
    const productCards = await analyzeProductCards(vendorName);
    const pages = await analyzePages(productCards, vendorName);
    await analyzeQueues(pages, vendorName);

    console.log('\n✅ Analysis complete!');
  } catch (error) {
    console.error('\n❌ Analysis failed:', error);
    process.exit(1);
  }
}

main();
