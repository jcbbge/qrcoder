import { query } from './lib/neon-script-client.js';

async function findGuidMismatches() {
  console.log('🔍 Finding all GUID format mismatches...\n');

  // First get all records that DON'T match the full GID format
  const nonGidFormat = await query(`
    SELECT
      id,
      shopify_id,
      product_name,
      artist_name,
      created_at
    FROM product_cards
    WHERE shopify_id !~ '^gid://shopify/Product/[0-9]+$'
    ORDER BY artist_name, id;
  `);

  if (nonGidFormat.rows.length === 0) {
    console.log('✅ ALL GOOD! All records use proper GID format');
    return;
  }

  console.log(`⚠️  Found ${nonGidFormat.rows.length} records with non-GID format:\n`);

  // Group by format type for better analysis
  const byFormat = nonGidFormat.rows.reduce((acc, row) => {
    let format = 'unknown';
    if (row.shopify_id === null) format = 'null';
    else if (row.shopify_id === '') format = 'empty';
    else if (/^\d+$/.test(row.shopify_id)) format = 'numeric';
    else format = 'other';

    if (!acc[format]) acc[format] = [];
    acc[format].push(row);
    return acc;
  }, {});

  // Print summary by format
  console.log('SUMMARY BY FORMAT:');
  console.log('------------------');
  Object.entries(byFormat).forEach(([format, rows]) => {
    console.log(`\n${format.toUpperCase()}: ${rows.length} records`);
    console.log('Example records:');
    rows.slice(0, 3).forEach(row => {
      console.log(`  [${row.id}] ${row.artist_name} | "${row.shopify_id}" | ${row.product_name}`);
    });
    if (rows.length > 3) {
      console.log(`  ... and ${rows.length - 3} more`);
    }
  });

  // Check for any duplicates where one is GID and one isn't
  console.log('\n\nCHECKING FOR DUPLICATE PRODUCTS (GID vs non-GID)...');
  console.log('------------------------------------------------');

  const duplicates = await query(`
    WITH numeric_ids AS (
      SELECT REGEXP_REPLACE(shopify_id, '^gid://shopify/Product/', '') as numeric_part, id, shopify_id, product_name, artist_name
      FROM product_cards
      WHERE shopify_id ~ '^gid://shopify/Product/[0-9]+$'
    ),
    non_gid_ids AS (
      SELECT shopify_id as numeric_part, id, shopify_id, product_name, artist_name
      FROM product_cards
      WHERE shopify_id ~ '^[0-9]+$'
    )
    SELECT
      n.id as gid_id,
      n.shopify_id as gid_shopify_id,
      ng.id as numeric_id,
      ng.shopify_id as numeric_shopify_id,
      n.product_name,
      n.artist_name
    FROM numeric_ids n
    INNER JOIN non_gid_ids ng ON n.numeric_part = ng.numeric_part;
  `);

  if (duplicates.rows.length > 0) {
    console.log(`⚠️  Found ${duplicates.rows.length} duplicate pairs (same product with different ID formats):`);
    duplicates.rows.forEach(row => {
      console.log(`\n${row.artist_name} | ${row.product_name}`);
      console.log(`  GID format    [${row.gid_id}]: ${row.gid_shopify_id}`);
      console.log(`  Numeric only  [${row.numeric_id}]: ${row.numeric_shopify_id}`);
    });
  } else {
    console.log('✅ No duplicate products found with different ID formats');
  }
}

// Run if called directly
if (process.argv[1].endsWith('find-guid-mismatches.js')) {
  findGuidMismatches().catch(console.error);
}
