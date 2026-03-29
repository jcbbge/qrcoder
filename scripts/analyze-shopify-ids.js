import { query } from './lib/neon-script-client.js';

async function analyzeShopifyIds() {
  console.log('🔍 Analyzing Shopify ID formats in database...\n');

  // Count by format type
  const formatCounts = await query(`
    SELECT
      CASE
        WHEN shopify_id IS NULL THEN 'null'
        WHEN shopify_id = '' THEN 'empty'
        WHEN shopify_id ~ '^gid://shopify/Product/[0-9]+$' THEN 'gid_format'
        WHEN shopify_id ~ '^[0-9]+$' THEN 'numeric_only'
        ELSE 'other'
      END as format_type,
      COUNT(*) as count
    FROM product_cards
    GROUP BY format_type
    ORDER BY count DESC;
  `);

  console.log('FORMAT COUNTS:');
  console.log('-------------');
  formatCounts.rows.forEach(row => {
    console.log(`${row.format_type}: ${row.count} records`);
  });

  // Check for duplicates (same numeric part, different format)
  const duplicates = await query(`
    WITH numeric_parts AS (
      SELECT
        id,
        shopify_id,
        CASE
          WHEN shopify_id ~ '^gid://shopify/Product/([0-9]+)$'
            THEN REGEXP_REPLACE(shopify_id, '^gid://shopify/Product/', '')
          WHEN shopify_id ~ '^[0-9]+$'
            THEN shopify_id
        END as numeric_part
      FROM product_cards
      WHERE shopify_id ~ '^gid://shopify/Product/[0-9]+$'
         OR shopify_id ~ '^[0-9]+$'
    )
    SELECT numeric_part, COUNT(*) as count
    FROM numeric_parts
    WHERE numeric_part IS NOT NULL
    GROUP BY numeric_part
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC;
  `);

  if (duplicates.rows.length > 0) {
    console.log('\nDUPLICATE PRODUCTS:');
    console.log('-----------------');
    console.log(`Found ${duplicates.rows.length} products with multiple records:`);

    // Show details for first few duplicates
    for (const dup of duplicates.rows.slice(0, 5)) {
      const details = await query(`
        SELECT id, shopify_id, product_name, artist_name
        FROM product_cards
        WHERE shopify_id ~ ('^gid://shopify/Product/' || $1 || '$')
           OR shopify_id = $1
        ORDER BY shopify_id;
      `, [dup.numeric_part]);

      console.log(`\nProduct ${dup.numeric_part} appears ${dup.count} times:`);
      details.rows.forEach(d => {
        console.log(`  [${d.id}] ${d.artist_name} | "${d.product_name}"`);
        console.log(`      shopify_id: ${d.shopify_id}`);
      });
    }
    if (duplicates.rows.length > 5) {
      console.log(`\n... and ${duplicates.rows.length - 5} more duplicate sets`);
    }
  } else {
    console.log('\n✅ No duplicate products found!');
  }

  // Sample of any 'other' format IDs
  const others = await query(`
    SELECT id, shopify_id, product_name, artist_name
    FROM product_cards
    WHERE shopify_id IS NOT NULL
      AND shopify_id != ''
      AND shopify_id !~ '^gid://shopify/Product/[0-9]+$'
      AND shopify_id !~ '^[0-9]+$'
    LIMIT 5;
  `);

  if (others.rows.length > 0) {
    console.log('\nUNEXPECTED ID FORMATS:');
    console.log('--------------------');
    others.rows.forEach(row => {
      console.log(`[${row.id}] ${row.artist_name} | "${row.product_name}"`);
      console.log(`    shopify_id: ${row.shopify_id}`);
    });
  }
}

// Run if called directly
if (process.argv[1].endsWith('analyze-shopify-ids.js')) {
  analyzeShopifyIds().catch(console.error);
}
