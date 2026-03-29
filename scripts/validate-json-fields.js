import { query } from './lib/neon-script-client.js';

async function validateJsonFields() {
  console.log('Starting JSON field validation...');
  const issues = [];

  try {
    // 1. Validate pages.card_ids
    console.log('\nChecking pages.card_ids...');
    const pagesQuery = 'SELECT id, card_ids FROM pages';
    const pages = (await query(pagesQuery)).rows;

    for (const page of pages) {
      try {
        const cardIds = JSON.parse(page.card_ids);
        if (!Array.isArray(cardIds)) {
          issues.push({
            table: 'pages',
            field: 'card_ids',
            id: page.id,
            value: page.card_ids,
            error: 'Not an array'
          });
        }
      } catch (e) {
        issues.push({
          table: 'pages',
          field: 'card_ids',
          id: page.id,
          value: page.card_ids,
          error: e.message
        });
      }
    }

    // 2. Validate product_cards.custom_data
    console.log('\nChecking product_cards.custom_data...');
    const customDataQuery = 'SELECT id, custom_data FROM product_cards';
    const cards = (await query(customDataQuery)).rows;

    for (const card of cards) {
      try {
        const customData = JSON.parse(card.custom_data);
        if (typeof customData !== 'object' || Array.isArray(customData)) {
          issues.push({
            table: 'product_cards',
            field: 'custom_data',
            id: card.id,
            value: card.custom_data,
            error: 'Not an object'
          });
        }
      } catch (e) {
        issues.push({
          table: 'product_cards',
          field: 'custom_data',
          id: card.id,
          value: card.custom_data,
          error: e.message
        });
      }
    }

    // 3. Validate product_cards.metrics
    console.log('\nChecking product_cards.metrics...');
    const metricsQuery = 'SELECT id, metrics FROM product_cards';
    const products = (await query(metricsQuery)).rows;

    for (const product of products) {
      try {
        const metrics = JSON.parse(product.metrics);
        if (typeof metrics !== 'object' || Array.isArray(metrics)) {
          issues.push({
            table: 'product_cards',
            field: 'metrics',
            id: product.id,
            value: product.metrics,
            error: 'Not an object'
          });
        }
        // Validate required metrics fields
        if (typeof metrics.scanCount !== 'number') {
          issues.push({
            table: 'product_cards',
            field: 'metrics',
            id: product.id,
            value: product.metrics,
            error: 'Missing or invalid scanCount'
          });
        }
        if (!('lastScanAt' in metrics)) {
          issues.push({
            table: 'product_cards',
            field: 'metrics',
            id: product.id,
            value: product.metrics,
            error: 'Missing lastScanAt field'
          });
        }
      } catch (e) {
        issues.push({
          table: 'product_cards',
          field: 'metrics',
          id: product.id,
          value: product.metrics,
          error: e.message
        });
      }
    }

    // Report results
    console.log('\n=== Validation Results ===');
    if (issues.length === 0) {
      console.log('✅ All JSON fields are valid!');
    } else {
      console.log(`❌ Found ${issues.length} issues:`);
      issues.forEach((issue, i) => {
        console.log(`\nIssue #${i + 1}:`);
        console.log(`Table: ${issue.table}`);
        console.log(`Field: ${issue.field}`);
        console.log(`ID: ${issue.id}`);
        console.log(`Value: ${issue.value}`);
        console.log(`Error: ${issue.error}`);
      });

      // Suggest fixes
      console.log('\n=== Suggested Fixes ===');
      console.log('1. For pages.card_ids issues:');
      console.log('   Run: node scripts/fix-card-ids.js');

      console.log('\n2. For product_cards.custom_data issues:');
      console.log('   Run: UPDATE product_cards SET custom_data = \'{}\' WHERE id IN (...);');

      console.log('\n3. For product_cards.metrics issues:');
      console.log('   Run: UPDATE product_cards SET metrics = \'{"scanCount":0,"lastScanAt":null}\' WHERE id IN (...);');
    }

  } catch (error) {
    console.error('Error during validation:', error);
    process.exit(1);
  }
}

// Run validation
validateJsonFields().catch(console.error);
