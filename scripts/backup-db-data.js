import 'dotenv/config';
import { query as dbQuery } from './lib/neon-script-client.js';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '');
  const backupDir = path.join(process.cwd(), 'backups', timestamp);

  try {
    // Create backup directory
    await fs.mkdir(backupDir, { recursive: true });
    console.log(`\n📁 Created backup directory: ${backupDir}`);

    // Backup product_cards
    console.log('\n📦 Backing up product_cards...');
    const productCards = await dbQuery('SELECT * FROM product_cards ORDER BY id');
    await fs.writeFile(
      path.join(backupDir, 'product_cards.json'),
      JSON.stringify(productCards.rows, null, 2)
    );
    console.log(`✅ Backed up ${productCards.rows.length} product cards`);

    // Backup pages
    console.log('\n📄 Backing up pages...');
    const pages = await dbQuery('SELECT * FROM pages ORDER BY id');
    await fs.writeFile(
      path.join(backupDir, 'pages.json'),
      JSON.stringify(pages.rows, null, 2)
    );
    console.log(`✅ Backed up ${pages.rows.length} pages`);

    // Backup queues
    console.log('\n🔄 Backing up queues...');
    const queues = await dbQuery('SELECT * FROM queues ORDER BY id');
    await fs.writeFile(
      path.join(backupDir, 'queues.json'),
      JSON.stringify(queues.rows, null, 2)
    );
    console.log(`✅ Backed up ${queues.rows.length} queues`);

    // Create restore script
    const restoreScript = `
-- Restore script generated ${new Date().toISOString()}
-- WARNING: This will DELETE all existing data before restoring!

BEGIN;

-- Clear existing data
TRUNCATE product_cards, pages, queues RESTART IDENTITY CASCADE;

-- Restore data
${productCards.rows.map(card => `
INSERT INTO product_cards (
  id, shopify_id, product_name, artist_name, price,
  image_url, "onlineStoreUrl", status, page_id,
  page_position, qr_code_generated, custom_data,
  metrics, created_at, updated_at,
  downloaded_at, printed_at
) VALUES (
  ${card.id},
  ${card.shopify_id ? `'${card.shopify_id}'` : 'NULL'},
  '${card.product_name.replace(/'/g, "''")}',
  '${card.artist_name.replace(/'/g, "''")}',
  ${card.price ? `'${card.price}'` : 'NULL'},
  ${card.image_url ? `'${card.image_url}'` : 'NULL'},
  ${card.onlineStoreUrl ? `'${card.onlineStoreUrl}'` : 'NULL'},
  '${card.status}',
  ${card.page_id || 'NULL'},
  ${card.page_position || 'NULL'},
  ${card.qr_code_generated || 0},
  '${card.custom_data}',
  '${card.metrics}',
  ${card.created_at ? `'${card.created_at.toISOString()}'` : 'NULL'},
  ${card.updated_at ? `'${card.updated_at.toISOString()}'` : 'NULL'},
  ${card.downloaded_at ? `'${card.downloaded_at.toISOString()}'` : 'NULL'},
  ${card.printed_at ? `'${card.printed_at.toISOString()}'` : 'NULL'}
);`).join('\n')}

${pages.rows.map(page => `
INSERT INTO pages (
  id, name, type, status, card_ids,
  pdf_url, custom_data, metrics,
  created_at, updated_at, printed_at,
  printed_by, downloaded_at, downloaded_by,
  queue_id
) VALUES (
  ${page.id},
  '${page.name.replace(/'/g, "''")}',
  '${page.type}',
  '${page.status}',
  '${page.card_ids}',
  ${page.pdf_url ? `'${page.pdf_url}'` : 'NULL'},
  '${page.custom_data}',
  '${page.metrics}',
  ${page.created_at ? `'${page.created_at.toISOString()}'` : 'NULL'},
  ${page.updated_at ? `'${page.updated_at.toISOString()}'` : 'NULL'},
  ${page.printed_at ? `'${page.printed_at.toISOString()}'` : 'NULL'},
  ${page.printed_by ? `'${page.printed_by}'` : 'NULL'},
  ${page.downloaded_at ? `'${page.downloaded_at.toISOString()}'` : 'NULL'},
  ${page.downloaded_by ? `'${page.downloaded_by}'` : 'NULL'},
  ${page.queue_id || 'NULL'}
);`).join('\n')}

${queues.rows.map(queue => `
INSERT INTO queues (
  id, name, status, page_ids,
  custom_data, metrics, created_at,
  updated_at, processed_at, processed_by
) VALUES (
  ${queue.id},
  '${queue.name.replace(/'/g, "''")}',
  '${queue.status}',
  '${queue.page_ids}',
  '${queue.custom_data}',
  '${queue.metrics}',
  ${queue.created_at ? `'${queue.created_at.toISOString()}'` : 'NULL'},
  ${queue.updated_at ? `'${queue.updated_at.toISOString()}'` : 'NULL'},
  ${queue.processed_at ? `'${queue.processed_at.toISOString()}'` : 'NULL'},
  ${queue.processed_by ? `'${queue.processed_by}'` : 'NULL'}
);`).join('\n')}

-- Reset sequences
SELECT setval('product_cards_id_seq', (SELECT MAX(id) FROM product_cards));
SELECT setval('pages_id_seq', (SELECT MAX(id) FROM pages));
SELECT setval('queues_id_seq', (SELECT MAX(id) FROM queues));

COMMIT;
    `;

    await fs.writeFile(
      path.join(backupDir, 'restore.sql'),
      restoreScript
    );
    console.log(`\n✅ Created restore script: ${path.join(backupDir, 'restore.sql')}`);

    console.log('\n🎉 Backup completed successfully!');
    console.log(`📂 Backup location: ${backupDir}`);
    console.log('\nTo restore this backup:');
    console.log(`1. psql \$DATABASE_URL -f ${path.join(backupDir, 'restore.sql')}`);

  } catch (error) {
    console.error('Error during backup:', error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1].endsWith('backup-db-data.js')) {
  main();
}
