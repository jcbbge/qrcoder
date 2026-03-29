import { query } from './lib/neon-script-client.js';

async function checkShopifyIds() {
  console.log('Checking Shopify IDs in database...\n');

  // Get sample of 5 records from each vendor
  const vendorSamples = await query(`
    WITH RankedProducts AS (
      SELECT
        id,
        shopify_id,
        product_name,
        artist_name,
        ROW_NUMBER() OVER (PARTITION BY artist_name ORDER BY id) as rn
      FROM product_cards
    )
    SELECT * FROM RankedProducts
    WHERE rn <= 5
    ORDER BY artist_name, id;
  `);

  console.log('Sample records by vendor:');
  console.log('------------------------');

  let currentVendor = null;
  for (const record of vendorSamples.rows) {
    if (currentVendor !== record.artist_name) {
      currentVendor = record.artist_name;
      console.log(`\n${currentVendor}:`);
    }
    console.log(`  [${record.id}] shopify_id: ${record.shopify_id} | ${record.product_name}`);
  }

  // Check for any non-numeric shopify_ids
  const nonNumeric = await query(`
    SELECT id, shopify_id, product_name, artist_name
    FROM product_cards
    WHERE shopify_id !~ '^[0-9]+$'
    LIMIT 5;
  `);

  if (nonNumeric.rows.length > 0) {
    console.log('\n⚠️ Found non-numeric Shopify IDs:');
    for (const record of nonNumeric.rows) {
      console.log(`  [${record.id}] shopify_id: ${record.shopify_id} | ${record.product_name} by ${record.artist_name}`);
    }
  } else {
    console.log('\n✅ All Shopify IDs are numeric');
  }

  // Check for any duplicate shopify_ids
  const duplicates = await query(`
    SELECT shopify_id, COUNT(*) as count
    FROM product_cards
    GROUP BY shopify_id
    HAVING COUNT(*) > 1
    LIMIT 5;
  `);

  if (duplicates.rows.length > 0) {
    console.log('\n⚠️ Found duplicate Shopify IDs:');
    for (const record of duplicates.rows) {
      console.log(`  ${record.shopify_id} appears ${record.count} times`);
    }
  } else {
    console.log('✅ No duplicate Shopify IDs found');
  }
}

// Run if called directly
if (process.argv[1].endsWith('check-shopify-ids.js')) {
  checkShopifyIds().catch(console.error);
}
