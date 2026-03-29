import { query } from './lib/neon-script-client.js';

async function fixDuplicateShopifyIds() {
  console.log('🔄 Finding and fixing duplicate Shopify ID records...\n');

  // First get all duplicate pairs
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

  if (duplicates.rows.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }

  console.log(`Found ${duplicates.rows.length} duplicate pairs to fix.\n`);

  // For each duplicate pair:
  // 1. Update any references to the numeric ID record to point to the GID record
  // 2. Delete the numeric ID record
  for (const row of duplicates.rows) {
    console.log(`Processing: ${row.artist_name} | ${row.product_name}`);
    console.log(`  GID format    [${row.gid_id}]: ${row.gid_shopify_id}`);
    console.log(`  Numeric only  [${row.numeric_id}]: ${row.numeric_shopify_id}`);

    try {
      // Start transaction
      await query('BEGIN');

      // 1. Get pages that reference the numeric ID
      const pages = await query(
        `SELECT id, card_ids FROM pages WHERE card_ids LIKE $1`,
        [`%${row.numeric_id}%`]
      );

      // 2. Update each page's card_ids
      for (const page of pages.rows) {
        // Parse the JSON string into an array
        const cardIds = JSON.parse(page.card_ids);

        // Replace the numeric ID with the GID version
        const updatedCardIds = cardIds.map(id =>
          id === row.numeric_id ? row.gid_id : id
        );

        // Update the page with the new card_ids
        await query(
          `UPDATE pages SET card_ids = $1 WHERE id = $2`,
          [JSON.stringify(updatedCardIds), page.id]
        );
      }

      // 3. Delete the numeric ID record
      await query('DELETE FROM product_cards WHERE id = $1', [row.numeric_id]);

      // Commit transaction
      await query('COMMIT');
      console.log('  ✅ Fixed\n');

    } catch (error) {
      // Rollback on error
      await query('ROLLBACK');
      console.error(`  ❌ Error fixing duplicate: ${error.message}\n`);
    }
  }

  console.log('\nDone! Verifying no remaining duplicates...');

  // Verify fix
  const remaining = await query(`
    WITH numeric_ids AS (
      SELECT REGEXP_REPLACE(shopify_id, '^gid://shopify/Product/', '') as numeric_part
      FROM product_cards
      WHERE shopify_id ~ '^gid://shopify/Product/[0-9]+$'
    ),
    non_gid_ids AS (
      SELECT shopify_id as numeric_part
      FROM product_cards
      WHERE shopify_id ~ '^[0-9]+$'
    )
    SELECT COUNT(*) as count
    FROM numeric_ids n
    INNER JOIN non_gid_ids ng ON n.numeric_part = ng.numeric_part;
  `);

  if (remaining.rows[0].count === 0) {
    console.log('✅ All duplicates have been fixed!');
  } else {
    console.log(`⚠️  ${remaining.rows[0].count} duplicate pairs still remain. Please run the script again.`);
  }
}

// Run if called directly
if (process.argv[1].endsWith('fix-duplicate-shopify-ids.js')) {
  fixDuplicateShopifyIds().catch(console.error);
}
