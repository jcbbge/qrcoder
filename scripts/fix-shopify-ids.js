import { query } from './lib/neon-script-client.js';

async function fixShopifyIds() {
  console.log('🔄 Converting numeric Shopify IDs to GID format...\n');

  // Get all records with numeric-only IDs
  const numericIds = await query(`
    SELECT id, shopify_id, product_name, artist_name
    FROM product_cards
    WHERE shopify_id ~ '^[0-9]+$'
    ORDER BY artist_name, product_name;
  `);

  if (numericIds.rows.length === 0) {
    console.log('✅ No numeric-only IDs found!');
    return;
  }

  console.log(`Found ${numericIds.rows.length} records to fix.\n`);

  // Fix each record
  for (const row of numericIds.rows) {
    const gid = `gid://shopify/Product/${row.shopify_id}`;

    console.log(`${row.artist_name} | ${row.product_name}`);
    console.log(`  ${row.shopify_id} -> ${gid}`);

    await query(
      'UPDATE product_cards SET shopify_id = $1 WHERE id = $2',
      [gid, row.id]
    );
  }

  console.log('\n✅ All done! Verifying...');

  // Verify no numeric-only IDs remain
  const remaining = await query(`
    SELECT COUNT(*) as count
    FROM product_cards
    WHERE shopify_id ~ '^[0-9]+$';
  `);

  if (remaining.rows[0].count === 0) {
    console.log('✅ All Shopify IDs are now in GID format!');
  } else {
    console.log(`⚠️  ${remaining.rows[0].count} numeric IDs still remain. Please run the script again.`);
  }

  console.log('\n' + (dryRun ? '✅ Dry run complete!' : '✅ All records updated!'));
}

// Run if called directly
if (process.argv[1].endsWith('fix-shopify-ids.js')) {
  // Default to dry run unless --live is passed
  const dryRun = !process.argv.includes('--live');
  fixShopifyIds(dryRun).catch(console.error);
}
