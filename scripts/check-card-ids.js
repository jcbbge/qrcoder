import { query } from './lib/neon-script-client.js';

async function checkArrayFields() {
  console.log('Checking all array fields in database...\n');

  try {
    // Check pages.card_ids
    console.log('=== Checking pages.card_ids ===');
    const pagesResult = await query(`
      SELECT id, card_ids, created_at
      FROM pages
      WHERE card_ids IS NOT NULL
        AND card_ids != '[]'
        AND (
          card_ids LIKE '{%'  -- Postgres array format
          OR card_ids LIKE '"%'  -- String numbers
          OR card_ids NOT LIKE '[%'  -- Not starting with [
          OR card_ids ~ '[^0-9\[\],\s"]'  -- Contains characters other than numbers, brackets, commas
        )
      ORDER BY created_at DESC
      LIMIT 5;
    `);

    console.log(`Found ${pagesResult.rows.length} potentially problematic pages:`);
    pagesResult.rows.forEach(row => {
      console.log(`\nPage ID: ${row.id}`);
      console.log(`Created: ${row.created_at}`);
      console.log(`card_ids: ${row.card_ids}`);
      try {
        const parsed = JSON.parse(row.card_ids);
        console.log('Format:', Array.isArray(parsed) ? 'Array' : typeof parsed);
        console.log('Contains string numbers:', parsed.some(id => typeof id === 'string'));
      } catch (e) {
        console.log(`Cannot parse as JSON: ${e.message}`);
      }
    });

    // Check queues.page_ids
    console.log('\n=== Checking queues.page_ids ===');
    const queuesResult = await query(`
      SELECT id, page_ids, created_at
      FROM queues
      WHERE page_ids IS NOT NULL
        AND page_ids != '[]'
        AND (
          page_ids LIKE '{%'
          OR page_ids LIKE '"%'
          OR page_ids NOT LIKE '[%'
          OR page_ids ~ '[^0-9\[\],\s"]'
        )
      ORDER BY created_at DESC
      LIMIT 5;
    `);

    console.log(`Found ${queuesResult.rows.length} potentially problematic queues:`);
    queuesResult.rows.forEach(row => {
      console.log(`\nQueue ID: ${row.id}`);
      console.log(`Created: ${row.created_at}`);
      console.log(`page_ids: ${row.page_ids}`);
      try {
        const parsed = JSON.parse(row.page_ids);
        console.log('Format:', Array.isArray(parsed) ? 'Array' : typeof parsed);
        console.log('Contains string numbers:', parsed.some(id => typeof id === 'string'));
      } catch (e) {
        console.log(`Cannot parse as JSON: ${e.message}`);
      }
    });

    // Get total counts
    const counts = await query(`
      SELECT
        (SELECT COUNT(*) FROM pages
         WHERE card_ids IS NOT NULL
           AND card_ids != '[]'
           AND (
             card_ids LIKE '{%'
             OR card_ids LIKE '"%'
             OR card_ids NOT LIKE '[%'
             OR card_ids ~ '[^0-9\[\],\s"]'
           )
        ) as problematic_pages,
        (SELECT COUNT(*) FROM queues
         WHERE page_ids IS NOT NULL
           AND page_ids != '[]'
           AND (
             page_ids LIKE '{%'
             OR page_ids LIKE '"%'
             OR page_ids NOT LIKE '[%'
             OR page_ids ~ '[^0-9\[\],\s"]'
           )
        ) as problematic_queues;
    `);

    console.log('\n=== Summary ===');
    console.log(`Total problematic pages: ${counts.rows[0].problematic_pages}`);
    console.log(`Total problematic queues: ${counts.rows[0].problematic_queues}`);

  } catch (error) {
    console.error('Error:', error);
  }
}

checkArrayFields();
