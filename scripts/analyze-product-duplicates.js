import { query } from './lib/neon-script-client.js';

async function analyzeProductDuplicates() {
  console.log('🔍 Analyzing potential product duplicates and their relationships...\n');

  // 1. First get all pairs of duplicates (same numeric part, different format)
  const duplicatePairs = await query(`
    WITH numeric_parts AS (
      SELECT
        id,
        shopify_id,
        CASE
          WHEN shopify_id ~ '^gid://shopify/Product/([0-9]+)$'
            THEN REGEXP_REPLACE(shopify_id, '^gid://shopify/Product/', '')
          WHEN shopify_id ~ '^[0-9]+$'
            THEN shopify_id
        END as numeric_part,
        product_name,
        artist_name,
        created_at,
        updated_at
      FROM product_cards
      WHERE shopify_id ~ '^gid://shopify/Product/[0-9]+$'
         OR shopify_id ~ '^[0-9]+$'
    )
    SELECT
      a.id as id_1,
      a.shopify_id as shopify_id_1,
      a.product_name as name_1,
      a.created_at as created_1,
      a.updated_at as updated_1,
      b.id as id_2,
      b.shopify_id as shopify_id_2,
      b.product_name as name_2,
      b.created_at as created_2,
      b.updated_at as updated_2,
      a.artist_name
    FROM numeric_parts a
    JOIN numeric_parts b ON a.numeric_part = b.numeric_part
      AND a.id < b.id  -- Avoid self-joins and duplicates
    ORDER BY a.artist_name, a.product_name;
  `);

  console.log(`Found ${duplicatePairs.rows.length} duplicate pairs.\n`);

  // 2. Sample some duplicates to check if they're truly identical
  console.log('SAMPLE OF DUPLICATES:');
  console.log('-------------------');
  for (const pair of duplicatePairs.rows.slice(0, 5)) {
    console.log(`\n${pair.artist_name}:`);
    console.log(`  Record 1: [${pair.id_1}] "${pair.name_1}"`);
    console.log(`    Shopify ID: ${pair.shopify_id_1}`);
    console.log(`    Created: ${pair.created_1}`);
    console.log(`    Updated: ${pair.updated_1}`);
    console.log(`  Record 2: [${pair.id_2}] "${pair.name_2}"`);
    console.log(`    Shopify ID: ${pair.shopify_id_2}`);
    console.log(`    Created: ${pair.created_2}`);
    console.log(`    Updated: ${pair.updated_2}`);
  }

  // 3. Check how these IDs are used in pages
  console.log('\nANALYZING PAGE REFERENCES:');
  console.log('------------------------');

  // Get a sample of pages and their card_ids
  const pageRefs = await query(`
    SELECT id, name, card_ids
    FROM pages
    WHERE card_ids IS NOT NULL
      AND card_ids != ''
    LIMIT 10;
  `);

  console.log('\nSAMPLE PAGE REFERENCES:');
  for (const page of pageRefs.rows) {
    console.log(`\nPage: "${page.name}" [${page.id}]`);
    try {
      const cardIds = JSON.parse(page.card_ids);
      console.log(`  Card IDs: ${JSON.stringify(cardIds)}`);

      // Check which format these IDs correspond to
      const cards = await query(`
        SELECT id, shopify_id, product_name
        FROM product_cards
        WHERE id = ANY($1);
      `, [cardIds]);

      console.log('  Referenced products:');
      for (const card of cards.rows) {
        console.log(`    [${card.id}] ${card.product_name}`);
        console.log(`      Shopify ID: ${card.shopify_id}`);
      }
    } catch (e) {
      console.log(`  ⚠️  Invalid card_ids format: ${page.card_ids}`);
    }
  }

  // 4. Let's also check the frontend code
  console.log('\nLooking for frontend code that handles Shopify IDs...');

  // First check if we have a ProductCard component
  const frontendFiles = await query(`
    SELECT COUNT(*) as count
    FROM product_cards
    WHERE shopify_id ~ '^gid://shopify/Product/'
      AND id IN (
        SELECT DISTINCT UNNEST(ARRAY(
          SELECT json_array_elements_text(card_ids::json)::integer
          FROM pages
          WHERE card_ids IS NOT NULL
            AND card_ids != ''
        ))
      );
  `);

  console.log(`\nProducts with GID format being actively used in pages: ${frontendFiles.rows[0].count}`);
}

// Run if called directly
if (process.argv[1].endsWith('analyze-product-duplicates.js')) {
  analyzeProductDuplicates().catch(console.error);
}
