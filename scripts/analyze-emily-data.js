import { query } from './lib/neon-script-client.js';

async function analyzeEmilyData(shouldDelete = false) {
  console.log('🔍 Analyzing Emily Merritt test data...\n');
  console.log(shouldDelete ? '⚠️  LIVE RUN - Will delete data!' : '🔍 DRY RUN - No changes will be made');

  // 1. Find all Emily's product cards
  console.log('\n1️⃣  Finding product cards...');
  const products = await query(`
    SELECT id, shopify_id, product_name, created_at
    FROM product_cards
    WHERE artist_name = 'Emily Merritt'
    ORDER BY created_at;
  `);

  console.log(`Found ${products.rows.length} product cards:`);
  for (const product of products.rows) {
    console.log(`  [${product.id}] "${product.product_name}"`);
    console.log(`    Shopify ID: ${product.shopify_id}`);
    console.log(`    Created: ${product.created_at}`);
  }

  // 2. Find pages that reference these products
  console.log('\n2️⃣  Finding pages...');
  const productIds = products.rows.map(p => p.id);

  const pageQuery = productIds.length > 0 ? `
    SELECT DISTINCT p.id, p.name, p.card_ids, p.created_at
    FROM pages p
    JOIN product_cards pc ON pc.page_id = p.id
    WHERE pc.id = ANY($1);
  ` : `
    SELECT id, name, card_ids, created_at
    FROM pages
    WHERE false;
  `;

  const pages = await query(
    pageQuery,
    productIds.length > 0 ? [productIds] : []
  );

  console.log(`Found ${pages.rows.length} pages:`);
  for (const page of pages.rows) {
    console.log(`\n  [${page.id}] "${page.name}"`);
    console.log(`    Created: ${page.created_at}`);
    const cardIds = JSON.parse(page.card_ids || '[]');
    console.log(`    Products: ${cardIds.join(', ')}`);
  }

  // 3. Find queues that reference these pages
  console.log('\n3️⃣  Finding queues...');
  const pageIds = pages.rows.map(p => p.id);

  const queueQuery = pageIds.length > 0 ? `
    SELECT DISTINCT q.id, q.name, q.page_ids, q.created_at, q.status
    FROM queues q
    JOIN pages p ON p.queue_id = q.id
    WHERE p.id = ANY($1);
  ` : `
    SELECT id, name, page_ids, created_at, status
    FROM queues
    WHERE false;
  `;

  const queues = await query(
    queueQuery,
    pageIds.length > 0 ? [pageIds] : []
  );

  console.log(`Found ${queues.rows.length} queues:`);
  for (const queue of queues.rows) {
    console.log(`\n  [${queue.id}] "${queue.name}"`);
    console.log(`    Created: ${queue.created_at}`);
    console.log(`    Status: ${queue.status}`);
    try {
      const queuePageIds = JSON.parse(queue.page_ids || '[]');
      console.log(`    Pages: ${queuePageIds.join(', ')}`);
    } catch (error) {
      console.log(`    Pages: Error parsing page_ids: ${queue.page_ids}`);
    }
  }

  // If this is a live run, delete everything
  if (shouldDelete) {
    console.log('\n🗑️  Deleting data...');

    // Delete in reverse order to maintain referential integrity
    console.log('\nDeleting queues...');
    for (const queue of queues.rows) {
      await query('DELETE FROM queues WHERE id = $1', [queue.id]);
      console.log(`  ✓ Deleted queue ${queue.id}`);
    }

    console.log('\nDeleting pages...');
    for (const page of pages.rows) {
      await query('DELETE FROM pages WHERE id = $1', [page.id]);
      console.log(`  ✓ Deleted page ${page.id}`);
    }

    console.log('\nDeleting product cards...');
    for (const product of products.rows) {
      await query('DELETE FROM product_cards WHERE id = $1', [product.id]);
      console.log(`  ✓ Deleted product ${product.id}`);
    }

    console.log('\n✅ All Emily Merritt test data deleted!');
  } else {
    console.log('\n📊 Summary:');
    console.log(`  - ${products.rows.length} product cards`);
    console.log(`  - ${pages.rows.length} pages`);
    console.log(`  - ${queues.rows.length} queues`);
    console.log('\nRun with --live flag to delete all this data.');
  }
}

// Run if called directly
if (process.argv[1].endsWith('analyze-emily-data.js')) {
  const shouldDelete = process.argv.includes('--live');
  analyzeEmilyData(shouldDelete).catch(console.error);
}
