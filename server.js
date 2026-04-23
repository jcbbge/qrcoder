/**
 * QR Code Generator Server
 *
 * A simple HTTP server that handles both API requests and serves static files.
 * This server connects to the Neon PostgreSQL database and Shopify API to provide
 * data for the QR code generation frontend.
 */

import 'dotenv/config';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { productCards, pages, queues, execute } from './src/db.js';
import * as shopify from './src/shopify.js';
import QRCode from 'qrcode';

// Import the new sync function
import { runSync } from './scripts/sync-vendor-pages-webapp.js';

// Setup path resolution for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server configuration
const PORT = process.env.PORT || 3000;

// MIME types for static file serving
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

// Handle API requests
async function handleApiRequest(req, res) {
  const url = req.url;
  const baseUrl = url.split('?')[0];

  // GET /api/product-cards - Get all product cards
  if (baseUrl === '/api/product-cards' && req.method === 'GET') {
    try {
      const cards = await productCards.getAllProductCards();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cards));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // GET /api/product-cards/bulk - Get product cards by Shopify IDs
  if (baseUrl === '/api/product-cards/bulk' && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const shopifyIds = urlObj.searchParams.get('shopify_ids')?.split(',') || [];

      if (!shopifyIds.length) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'shopify_ids parameter is required' }));
        return;
      }

      const cards = await productCards.getProductCardsByShopifyIds(shopifyIds);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cards));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // POST /api/product-cards - Create a product card
  if (baseUrl === '/api/product-cards' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const card = await productCards.createProductCard(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(card));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // POST /api/product-cards/bulk - Create multiple product cards
  if (baseUrl === '/api/product-cards/bulk' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);

        if (!data.products || !Array.isArray(data.products)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'products array is required' }));
          return;
        }

        const cards = await productCards.createProductCardsBulk(data.products);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cards));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // POST /api/pages/auto-create - Create pages from unprocessed cards
  if (baseUrl === '/api/pages/auto-create' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const cardsPerPage = data.cardsPerPage || 10;

        // Only create new auto pages if explicitly requested (default behavior)
        if (data.useExisting !== true) {
          // Use original auto-create behavior
          const result = await pages.createAutoPagesFromUnprocessedCards(cardsPerPage);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, pages: result }));
        } else {
          // Use find available page functionality
          const result = await pages.findAvailablePage(cardsPerPage);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            page: result.page,
            availableSlots: result.availableSlots
          }));
        }
      } catch (error) {
        console.error('Error handling page creation:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // GET /api/pages/available - Find an available page with space
  if (baseUrl === '/api/pages/available' && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const cardsPerPage = parseInt(urlObj.searchParams.get('cardsPerPage') || '10', 10);

      const result = await pages.findAvailablePage(cardsPerPage);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        page: result.page,
        availableSlots: result.availableSlots
      }));
    } catch (error) {
      console.error('Error finding available page:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // GET /api/pages - Get all pages or filter by queue_id
  if (baseUrl === '/api/pages' && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const queueId = urlObj.searchParams.get('queue_id');

      console.log(`[API] Fetching pages${queueId ? ` for queue_id: ${queueId}` : ' (all)'}`);

      let allPages;
      if (queueId) {
        // Filter pages by queue_id
        allPages = await pages.getPagesByQueueId(queueId);
      } else {
        // Get all pages
        allPages = await pages.getAllPages();
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(allPages));
    } catch (error) {
      console.error('Error fetching pages:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // GET /api/pages/:id - Get a specific page by ID
  if (baseUrl.match(/^\/api\/pages\/\d+$/) && req.method === 'GET') {
    try {
      const pageId = baseUrl.split('/').pop();
      console.log('[API] Fetching page with ID:', pageId);

      // Get the page from database
      const query = 'SELECT * FROM pages WHERE id = $1';
      const result = await execute(query, [pageId]);

      if (result.rows.length === 0) {
        console.log('[API] Page not found:', pageId);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Page not found' }));
        return;
      }

      console.log('[API] Successfully fetched page:', pageId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.rows[0]));
    } catch (error) {
      console.error('[API] Error fetching page:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // PUT /api/pages/:id/status - Update a page's status
  if (baseUrl.match(/^\/api\/pages\/\d+\/status$/) && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        // Validate request format
        console.log('[API] Page status update request received for URL:', baseUrl);
        const pageIdMatch = baseUrl.match(/\/api\/pages\/(\d+)\/status/);

        if (!pageIdMatch || !pageIdMatch[1]) {
          console.error('[API] Failed to extract page ID from URL:', baseUrl);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid page ID in request URL' }));
          return;
        }

        const pageId = pageIdMatch[1];
        console.log('[API] Extracted page ID:', pageId);

        // Parse and validate request body
        try {
          console.log('[API] Request body:', body);
          const data = JSON.parse(body);

          if (!data.status) {
            console.error('[API] Status field missing in request body');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Status field is required' }));
            return;
          }

          console.log('[API] Updating page status:', {
            page_id: pageId,
            new_status: data.status
          });

          // First check if the page exists
          const checkQuery = 'SELECT id, status FROM pages WHERE id = $1';
          const checkResult = await execute(checkQuery, [pageId]);

          if (checkResult.rowCount === 0) {
            console.log('[API] Page not found for status update:', pageId);
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Page not found' }));
            return;
          }

          console.log('[API] Found page to update:', {
            page_id: pageId,
            current_status: checkResult.rows[0].status
          });

          // Update the page status
          const updateQuery = `
            UPDATE pages
            SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
          `;

          console.log('[API] Executing status update query with params:', {
            status: data.status,
            page_id: pageId
          });

          const result = await execute(updateQuery, [data.status, pageId]);

          console.log('[API] Status update query result:', {
            rowCount: result.rowCount,
            firstRow: result.rows[0] ? JSON.stringify(result.rows[0]).substring(0, 100) : null
          });

          if (result.rowCount === 0) {
            console.error('[API] Failed to update page status after verification!');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to update page status' }));
            return;
          }

          console.log('[API] Successfully updated page status:', {
            page_id: pageId,
            old_status: checkResult.rows[0].status,
            new_status: data.status
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result.rows[0]));
        } catch (parseError) {
          console.error('[API] Error parsing request body:', parseError);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
          return;
        }
      } catch (error) {
        console.error('[API] Error updating page status:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: error.message,
          stack: error.stack,
          details: 'Error occurred while updating page status'
        }));
      }
    });
    return;
  }

  // GET /api/product-cards/:id - Get a specific product card by ID
  if (baseUrl.match(/^\/api\/product-cards\/\d+$/) && req.method === 'GET') {
    try {
      const cardId = baseUrl.split('/').pop();
      console.log('[API] Fetching product card with ID:', cardId);

      // Fetch the product card from the database
      const query = 'SELECT * FROM product_cards WHERE id = $1';
      const result = await execute(query, [cardId]);

      if (result.rows.length === 0) {
        console.log('[API] Product card not found:', cardId);
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Product card not found' }));
        return;
      }

      console.log('[API] Successfully fetched product card:', cardId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // Ensure the response includes onlineStoreUrl if it exists
      const cardData = result.rows[0];
      res.end(JSON.stringify(cardData));
    } catch (error) {
      console.error('[API] Error fetching product card:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // GET /api/products/search - Search for products (filtered by vendor)
  if (baseUrl === '/api/products/search' && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const query = urlObj.searchParams.get('q');
      const vendorName = urlObj.searchParams.get('vendor'); // Get vendor name

      if (!query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Search query parameter \"q\" is required' }));
      }
      if (!vendorName) { // Require vendor name
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Vendor name parameter \"vendor\" is required' }));
      }

      console.log(`[API] Searching products for vendor: "${vendorName}" with query: "${query}"`);
      const searchQuery = `%${query}%`;
      const result = await execute(
        `SELECT id, product_name as title, price, image_url
         FROM product_cards
         WHERE artist_name ILIKE $1 -- Filter by vendor first
           AND product_name ILIKE $2 -- Then by product name
         ORDER BY product_name ASC
         LIMIT 10`,
        [vendorName, searchQuery] // Use both parameters
      );

      console.log(`[API] Found ${result.rows.length} products matching query for vendor ${vendorName}.`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.rows));

    } catch (error) {
      console.error('[API] Error searching products:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error during product search' }));
    }
    return;
  }

  // POST /api/pages/download - Download selected pages and update statuses
  if (baseUrl === '/api/pages/download' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const pageIds = data.pageIds || [];
        const queueId = data.queueId;

        if (!queueId || pageIds.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'queueId and at least one pageId are required' }));
          return;
        }

        console.log(`[API] Processing download for Queue: ${queueId}, Pages: ${pageIds.join(',')}`);

        // 1. Update Queue status
        const updatedQueue = await queues.markProcessed(queueId);

        // 2. Update Page statuses and get associated card IDs
        const { updatedPages, cardIdsToUpdate } = await pages.markDownloaded(pageIds);

        // 3. Update Product Card statuses
        let updatedCardsCount = 0;
        if (cardIdsToUpdate.length > 0) {
          updatedCardsCount = await productCards.markDownloaded(cardIdsToUpdate);
        }

        console.log(`[API] Download processed. Queue: ${updatedQueue?.id}, Pages: ${updatedPages.length}, Cards: ${updatedCardsCount}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Queue ${queueId} marked as processed. ${updatedPages.length} pages and ${updatedCardsCount} cards marked as downloaded.`,
          updatedQueue: updatedQueue,
          updatedPages: updatedPages
        }));

      } catch (error) {
        console.error('[API] Error processing page download and status update:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // GET /api/queues - Get all queues or filter by vendor
  if (baseUrl === '/api/queues' && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const vendorQuery = urlObj.searchParams.get('vendor');

      console.log('[API] Fetching queues', vendorQuery ? `for vendor: ${vendorQuery}` : 'for all vendors');

      // Get all queues from the database
      const allQueues = await queues.getAllQueues();

      // If a vendor name is provided, filter queues by vendor name in custom_data field
      if (vendorQuery) {
        const filteredQueues = allQueues.filter(queue => {
          try {
            const customData = JSON.parse(queue.custom_data || '{}');
            return customData.vendorName?.toLowerCase().includes(vendorQuery.toLowerCase());
          } catch (e) {
            console.error('[API] Error parsing custom_data for queue:', queue.id, e);
            return false;
          }
        });

        console.log('[API] Found', filteredQueues.length, 'queues for vendor:', vendorQuery);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(filteredQueues));
      } else {
        // Return all queues if no vendor is specified
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(allQueues));
      }
    } catch (error) {
      console.error('[API] Error fetching queues:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error fetching queues' }));
    }
    return;
  }

  // POST /api/queues - Create a queue
  if (baseUrl === '/api/queues' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const queue = await queues.createQueue(data);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(queue));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // GET /api/shopify/vendors - Search for Shopify vendors
  if (baseUrl === '/api/shopify/vendors' && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const query = urlObj.searchParams.get('query') || '';

      let vendors = [];
      if (query && query.length >= 2) {
        vendors = await shopify.searchVendors(query);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(vendors));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // GET /api/shopify/products/vendor/:name - Get vendor's products from Shopify
  if (baseUrl.startsWith('/api/shopify/products/vendor/') && req.method === 'GET') {
    try {
      const vendorName = decodeURIComponent(baseUrl.split('/api/shopify/products/vendor/')[1]);

      if (!vendorName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Vendor name is required' }));
        return;
      }

      // Get products for vendor from Shopify
      const shopifyProducts = await shopify.getProductsByVendor(vendorName);

      // Log product details received
      console.log(`[SERVER] Retrieved ${shopifyProducts.length} products for vendor: ${vendorName}`);

      if (!shopifyProducts || shopifyProducts.length === 0) {
        console.log(`[SERVER] No products found for vendor: ${vendorName}`);
        const dummyResponse = []; // Return empty array instead of falling back to random products
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(dummyResponse));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(shopifyProducts));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // POST /api/shopify/sync - Sync Shopify products to Neon
  if (baseUrl === '/api/shopify/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { products } = data;

        if (!products || !Array.isArray(products) || products.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Products array is required' }));
          return;
        }

        // First, check which products already exist in the database
        const existingCards = await productCards.getProductCardsByShopifyIds(
          products.map(p => p.id.toString())
        );
        const existingIds = new Set(existingCards.map(card => card.shopify_id));

        // Filter out products that already exist
        const newProducts = products.filter(p => !existingIds.has(p.id.toString()));

        // Create the product card data
        const cardsToCreate = newProducts.map(p => ({
          ...p,
          onlineStoreUrl: p.onlineStoreUrl || p.onlineStoreUrl // Expect onlineStoreUrl, fallback to old
        }));
        const createdCards = await productCards.createProductCardsBulk(cardsToCreate);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Synced ${createdCards.length} new products`,
          existing: existingCards.length,
          synced: createdCards
        }));
      } catch (error) {
        console.error('Error in Shopify sync:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // POST /api/pages/new - Create a new empty page
  if (baseUrl === '/api/pages/new' && req.method === 'POST') {
    try {
      const page = await pages.createPage({
        name: `Page ${new Date().toISOString()}`,
        type: 'auto',
        status: 'ready',
        card_ids: '[]'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(page));
    } catch (error) {
      console.error('Error creating new page:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // GET /api/stats - Get application statistics including product cards, pages, and Shopify stats
  if (baseUrl === '/api/stats' && req.method === 'GET') {
    console.log('[SERVER] /api/stats endpoint called');
    try {
      // Get Shopify stats
      console.log('[SERVER] Fetching Shopify stats');
      const shopifyStats = await shopify.getShopifyStats();

      // Get Product Cards stats
      console.log('[SERVER] Executing SQL query for product cards stats');
      const productCardStats = await execute(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status != 'assigned') as unassigned,
          COUNT(*) FILTER (WHERE status = 'assigned') as assigned
        FROM product_cards
      `);
      console.log('[SERVER] Raw product card stats:', productCardStats.rows[0]);

      // Get Pages stats
      console.log('[SERVER] Executing SQL query for pages stats');
      const pagesStats = await execute(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE downloaded_at IS NULL) as ready,
          COUNT(*) FILTER (WHERE downloaded_at IS NOT NULL) as downloaded
        FROM pages
      `);
      console.log('[SERVER] Raw pages stats:', pagesStats.rows[0]);

      // Convert strings to numbers for the stats
      const productCards = {
        total: parseInt(productCardStats.rows[0].total) || 0,
        unassigned: parseInt(productCardStats.rows[0].unassigned) || 0,
        assigned: parseInt(productCardStats.rows[0].assigned) || 0
      };
      console.log('[SERVER] Parsed product cards stats:', productCards);

      const pages = {
        total: parseInt(pagesStats.rows[0].total) || 0,
        ready: parseInt(pagesStats.rows[0].ready) || 0,
        downloaded: parseInt(pagesStats.rows[0].downloaded) || 0
      };
      console.log('[SERVER] Parsed pages stats:', pages);

      // Build the complete stats object
      const stats = {
        productCards,
        pages,
        shopify: shopifyStats
      };

      console.log('[SERVER] Complete stats object:', JSON.stringify(stats, null, 2));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
      console.log('[SERVER] Stats response sent successfully');
    } catch (error) {
      console.error('[SERVER] Error generating stats:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // GET /api/shopify/activity - Get recent Shopify activity
  if (baseUrl === '/api/shopify/activity' && req.method === 'GET') {
    try {
      const activities = await shopify.getShopifyActivity();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(activities));
    } catch (error) {
      console.error('Error fetching Shopify activity:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // POST /api/shopify/refresh - Refresh Shopify data
  if (baseUrl === '/api/shopify/refresh' && req.method === 'POST') {
    try {
      // Refresh Shopify data
      const stats = await shopify.getShopifyStats();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Shopify data refreshed',
        stats
      }));
    } catch (error) {
      console.error('Error refreshing Shopify data:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // GET /api/qrcode - Generate QR code for URL
  if (baseUrl === '/api/qrcode' && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const targetUrl = urlObj.searchParams.get('url');

      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'url parameter is required' }));
        return;
      }

      const qrCodeDataUrl = await QRCode.toDataURL(targetUrl, {
        type: 'image/png',
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      });

      // Convert data URL to buffer and send
      const base64Data = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      res.end(imageBuffer);
    } catch (error) {
      console.error('Error generating QR code:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to generate QR code' }));
    }
    return;
  }

  // PUT /api/product-cards/position - Update product card position
  if (baseUrl === '/api/product-cards/position' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log('[API] Updating product card position:', data);

        if (!data.card_id) {
          throw new Error('card_id is required');
        }

        const result = await productCards.updatePosition(data);
        console.log('[API] Successfully updated product card position:', {
          card_id: data.card_id,
          position: data.position,
          status: data.status,
          result
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error('[API] Error updating product card position:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // POST /api/vendor/sync - Trigger sync for a vendor
  if (baseUrl === '/api/vendor/sync' && req.method === 'POST') {
    console.log('🔥 [SERVER] Received POST request to /api/vendor/sync');
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        console.log('🔥 [SERVER] Request body received:', body);
        const data = JSON.parse(body);
        const vendorName = data.vendorName;

        if (!vendorName) {
          console.error('🚨 [SERVER] Vendor name missing in request body');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Vendor name is required' }));
          return;
        }

        console.log(`🔥 [SERVER] Starting SYNC EXECUTION for vendor: ${vendorName}`);
        // WAIT for sync to complete before returning
        const result = await runSync({ vendorName, triggeredBy: 'manual-web' });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } catch (error) {
        console.error(`🚨 [SERVER] Error during sync processing for vendor '${vendorName}':`, error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Failed to process sync request',
          details: {
            message: error.message,
            counts: { products_failed: 1, products_created: 0, products_updated: 0 },
            operations: [{
              type: 'sync_failed',
              id: null,
              name: vendorName,
              details: { error: error.message }
            }]
          }
        }));
      }
    });
    return;
  }

  // GET /api/sync-logs - Get sync logs with optional filtering
  if (baseUrl === '/api/sync-logs' && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const vendor_name = urlObj.searchParams.get('vendor_name');
      const status = urlObj.searchParams.get('status');
      const start_date = urlObj.searchParams.get('start_date');
      const end_date = urlObj.searchParams.get('end_date');
      const limit = parseInt(urlObj.searchParams.get('limit') || '50', 10);

      // Build the query
      let query = 'SELECT * FROM sync_logs WHERE 1=1';
      const params = [];
      let paramCount = 1;

      if (vendor_name) {
        query += ` AND vendor_name = $${paramCount}`;
        params.push(vendor_name);
        paramCount++;
      }

      if (status) {
        query += ` AND status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      if (start_date) {
        query += ` AND run_at >= $${paramCount}`;
        params.push(start_date);
        paramCount++;
      }

      if (end_date) {
        query += ` AND run_at <= $${paramCount}`;
        params.push(end_date);
        paramCount++;
      }

      // Always order by most recent first
      query += ' ORDER BY run_at DESC';

      // Add limit
      query += ` LIMIT $${paramCount}`;
      params.push(limit);

      const result = await execute(query, params);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.rows));
    } catch (error) {
      console.error('Error fetching sync logs:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // POST /api/sync/all - Trigger sync for all vendors
  if (baseUrl === '/api/sync/all' && req.method === 'POST') {
    try {
      // Get all vendors
      const vendors = await shopify.getAllShopifyVendors();
      console.log(`🔄 [SYNC-ALL] Processing ${vendors.length} vendors...`);

      let processedCount = 0;

      for (const vendor of vendors) {
        // First check if vendor has any products that need syncing
        const { products: shopifyProducts } = await shopify.getPaginatedProductsByVendor(vendor);

        if (!shopifyProducts || shopifyProducts.length === 0) {
          continue; // Skip if no products at all
        }

        // Check if any products need syncing by comparing with our DB
        const shopifyIds = shopifyProducts.map(p => p.id);
        const existingProducts = await productCards.getProductCardsByShopifyIds(shopifyIds);
        const existingIds = new Set(existingProducts.map(p => p.shopify_id));

        // Check for new or updated products
        const needsSync = shopifyProducts.some(product => {
          // If product doesn't exist in our DB, it needs syncing
          if (!existingIds.has(product.id)) return true;

          // If product exists, check if price or other details changed
          const existingProduct = existingProducts.find(p => p.shopify_id === product.id);
          const currentPrice = product.priceRangeV2?.minVariantPrice?.amount?.toString() || '0';

          return existingProduct.price !== currentPrice ||
                 existingProduct.product_name !== product.title ||
                 existingProduct.artist_name !== product.vendor ||
                 existingProduct.onlineStoreUrl !== product.onlineStoreUrl;
        });

        // Only run sync if changes needed
        if (needsSync) {
          await runSync({
            vendorName: vendor,
            triggeredBy: 'sync_all_button'
          });
          processedCount++;
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'SUCCESS',
        message: `Processed ${processedCount} vendors with changes`
      }));

    } catch (error) {
      console.error('Error syncing all vendors:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // POST /api/sync/vendor - Trigger sync for a specific vendor
  if (baseUrl === '/api/sync/vendor' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      const vendorStartTime = Date.now();

      try {
        const data = JSON.parse(body);
        if (!data.vendor_name) {
          throw new Error('vendor_name is required');
        }

        const vendorName = data.vendor_name;
        console.log(`🔄 [SYNC-VENDOR] Starting sync for vendor: ${vendorName}`);

        // Initialize summary object to match sync-all format
        const summary = {
          totalVendors: 1,
          totalNewProducts: 0,
          totalUpdatedProducts: 0,
          totalNewPages: 0,
          totalNewQueues: 0,
          processedVendors: 0,
          errors: 0,
          createdProducts: [],
          updatedProducts: [],
          createdPages: [],
          createdQueues: []
        };

        try {
          // Process vendor using our sync script
          await processVendor(vendorName, summary);
          summary.processedVendors++;

          // Determine status
          const status = 'SUCCESS';
          const duration = Date.now() - vendorStartTime;

          // Create success sync log with proper JSONB format
          const summaryString =
            `${summary.totalNewProducts} new products, ` +
            `${summary.totalUpdatedProducts} updated, ` +
            `${summary.totalNewPages} new pages, ` +
            `${summary.totalNewQueues} new queues`;

          const details = {
            counts: {
              products_created: summary.totalNewProducts,
              products_updated: summary.totalUpdatedProducts,
              pages_created: summary.totalNewPages,
              queues_created: summary.totalNewQueues
            },
            operations: [
              ...summary.createdProducts.map(p => ({
                type: 'product_created',
                id: p.id,
                name: p.name,
                price: p.price,
                shopify_id: p.shopify_id,
                timestamp: p.timestamp,
                message: p.message
              })),
              ...summary.updatedProducts.map(p => ({
                type: 'product_updated',
                id: p.id,
                name: p.name,
                price: p.price,
                shopify_id: p.shopify_id,
                timestamp: p.timestamp,
                message: p.message
              })),
              ...summary.createdPages.map(p => ({
                type: 'page_created',
                id: p.id,
                name: p.name,
                timestamp: p.timestamp,
                message: p.message
              })),
              ...summary.createdQueues.map(q => ({
                type: 'queue_created',
                id: q.id,
                name: q.name,
                timestamp: q.timestamp,
                message: q.message
              }))
            ]
          };

          await query(
            `INSERT INTO sync_logs (
              vendor_name, status, summary, details, created_by, duration_ms
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              vendorName,
              status,
              summaryString,
              details,
              'SYNC_VENDOR',
              duration
            ]
          );

          console.log(`✅ [SYNC-VENDOR] Successfully processed ${vendorName}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status,
            summary: summaryString,
            details
          }));

        } catch (error) {
          summary.errors++;
          console.error(`❌ [SYNC-VENDOR] Error processing ${vendorName}:`, error);

          // Create error sync log with proper format
          const errorDetails = {
            error: error.message,
            timestamp: new Date().toISOString(),
            counts: {
              products_failed: 1,
              products_created: 0,
              products_updated: 0
            }
          };

          await query(
            `INSERT INTO sync_logs (
              vendor_name, status, summary, details, created_by, duration_ms
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              vendorName,
              'FAILURE',
              'Failed to sync vendor products',
              errorDetails,
              'SYNC_VENDOR',
              Date.now() - vendorStartTime
            ]
          );

          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'FAILURE',
            error: 'Failed to sync vendor',
            details: errorDetails
          }));
        }

      } catch (error) {
        console.error('🔥 [SYNC-VENDOR] Fatal error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'FAILURE',
          error: 'Failed to process sync request',
          details: error.message
        }));
      }
    });
    return;
  }

  // PUT /api/pages/:id - Update a page's card_ids
  if (baseUrl.match(/^\/api\/pages\/\d+$/) && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      const pageId = baseUrl.split('/').pop(); // Get pageId early for logging
      console.log(`🔥 [API PUT /api/pages/${pageId}] Received request.`);
      try {
        console.log(`🔥 [API PUT /api/pages/${pageId}] Request Body:`, body);
        const data = JSON.parse(body);
        console.log(`🔥 [API PUT /api/pages/${pageId}] Parsed Data:`, data);

        if (!data.card_ids) {
          console.error(`🚨 [API PUT /api/pages/${pageId}] Missing 'card_ids' in request body.`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'card_ids array string is required' }));
          return;
        }

        // It seems card_ids is already stringified on the frontend, log it directly
        const cardIdsString = data.card_ids;
        // Validate that cardIdsString is a string that looks like an array
        if (typeof cardIdsString !== 'string' || !cardIdsString.startsWith('[') || !cardIdsString.endsWith(']')) {
           console.error(`🚨 [API PUT /api/pages/${pageId}] Invalid card_ids format received. Expected JSON array string. Got:`, cardIdsString);
           res.writeHead(400, { 'Content-Type': 'application/json' });
           res.end(JSON.stringify({ error: 'Invalid card_ids format. Expected JSON array string.' }));
           return;
        }
        console.log(`🔥 [API PUT /api/pages/${pageId}] Updating with card_ids string:`, cardIdsString);

        // Update the page's card_ids
        const updatePageQuery = `
          UPDATE pages
          SET card_ids = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING *
        `;
        console.log(`🔥 [API PUT /api/pages/${pageId}] Executing SQL: ${updatePageQuery.replace(/\s+/g, ' ').trim()}`);
        console.log(`🔥 [API PUT /api/pages/${pageId}] SQL Params: [$1: ${cardIdsString}, $2: ${pageId}]`);

        let result;
        try {
          result = await execute(updatePageQuery, [cardIdsString, pageId]);
          console.log(`🔥 [API PUT /api/pages/${pageId}] DB Execute Result:`, result);
        } catch (dbError) {
          console.error(`🚨 [API PUT /api/pages/${pageId}] Database Error:`, dbError);
          // Log specific dbError properties if available
          console.error(`🚨 [API PUT /api/pages/${pageId}] DB Error Details: code=${dbError.code}, message=${dbError.message}`);
          throw new Error('Database update failed: ' + dbError.message);
        }

        if (!result || result.rowCount === 0) {
          console.error(`🚨 [API PUT /api/pages/${pageId}] Page not found or not updated. RowCount: ${result?.rowCount}`);
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Page not found or update failed' }));
          return;
        }

        console.log(`✅ [API PUT /api/pages/${pageId}] Successfully updated page.`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result.rows[0]));
      } catch (error) {
        console.error(`🚨 [API PUT /api/pages/${pageId}] Error processing request:`, error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message || 'Internal server error' }));
      }
    });
    return;
  }

  // POST /api/webhooks/shopify - Receive Shopify product webhooks
  if (baseUrl === '/api/webhooks/shopify' && req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      const receivedAt = Date.now();
      const rawBody = Buffer.concat(chunks);
      const hmacHeader = req.headers['x-shopify-hmac-sha256'];
      const topic = req.headers['x-shopify-topic'];
      const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;

      if (!webhookSecret) {
        console.error('🚨 [WEBHOOK] SHOPIFY_WEBHOOK_SECRET not set');
        res.writeHead(500);
        res.end();
        return;
      }

      const expectedHmac = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('base64');

      if (expectedHmac !== hmacHeader) {
        console.error(`🚨 [WEBHOOK] Invalid HMAC on topic=${topic} — rejected`);
        res.writeHead(401);
        res.end();
        return;
      }

      // Acknowledge immediately — Shopify requires 200 within 5s
      res.writeHead(200);
      res.end();

      // Process async after responding
      try {
        const payload = JSON.parse(rawBody.toString());
        const vendor = payload.vendor;
        console.log(`📥 [WEBHOOK] Received topic=${topic} vendor="${vendor}" product_id=${payload.id}`);

        if (!vendor) {
          console.warn(`⚠️ [WEBHOOK] No vendor on topic=${topic}, skipping`);
          return;
        }

        if (topic === 'products/delete') {
          const shopifyId = `gid://shopify/Product/${payload.id}`;
          const result = await execute(
            `UPDATE product_cards SET status = 'deleted', updated_at = NOW() WHERE shopify_id = $1`,
            [shopifyId]
          );
          const duration = Date.now() - receivedAt;
          console.log(`✅ [WEBHOOK] Deleted product ${payload.id} (${vendor}) — rows affected: ${result.rowCount} [${duration}ms]`);
          await execute(
            `INSERT INTO sync_logs (vendor_name, status, summary, details, created_by, duration_ms) VALUES ($1,$2,$3,$4,$5,$6)`,
            [vendor, 'SUCCESS', `Webhook: product deleted (id=${payload.id})`, JSON.stringify({ topic, shopify_id: payload.id }), 'webhook', duration]
          );
          return;
        }

        if (topic === 'products/create' || topic === 'products/update') {
          console.log(`🔄 [WEBHOOK] Triggering sync for vendor="${vendor}" (${topic})`);
          let syncStatus = 'SUCCESS';
          let syncSummary = '';
          try {
            const syncResult = await runSync({ vendorName: vendor, triggeredBy: 'webhook' });
            const duration = Date.now() - receivedAt;
            syncSummary = `Webhook sync: ${syncResult?.totalNewProducts ?? 0} new, ${syncResult?.totalUpdatedProducts ?? 0} updated`;
            console.log(`✅ [WEBHOOK] Sync complete for vendor="${vendor}" [${duration}ms] — ${syncSummary}`);
            await execute(
              `INSERT INTO sync_logs (vendor_name, status, summary, details, created_by, duration_ms) VALUES ($1,$2,$3,$4,$5,$6)`,
              [vendor, syncStatus, syncSummary, JSON.stringify({ topic, shopify_id: payload.id, result: syncResult }), 'webhook', duration]
            );
          } catch (syncErr) {
            syncStatus = 'FAILED';
            syncSummary = `Webhook sync failed: ${syncErr.message}`;
            const duration = Date.now() - receivedAt;
            console.error(`🚨 [WEBHOOK] Sync failed for vendor="${vendor}":`, syncErr.message);
            await execute(
              `INSERT INTO sync_logs (vendor_name, status, summary, details, created_by, duration_ms) VALUES ($1,$2,$3,$4,$5,$6)`,
              [vendor, syncStatus, syncSummary, JSON.stringify({ topic, error: syncErr.message }), 'webhook', duration]
            );
          }
        }
      } catch (err) {
        console.error('🚨 [WEBHOOK] Error processing payload:', err.message);
      }
    });
    return;
  }

  // GET /api/monitor - Traffic and pipeline health dashboard
  if (baseUrl === '/api/monitor' && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const limit = parseInt(urlObj.searchParams.get('limit') || '20', 10);

      const [cardCount, pageCount, queueCount, recentLogs, webhookLogs] = await Promise.all([
        execute('SELECT count(*) FROM product_cards WHERE status != $1', ['deleted']),
        execute('SELECT count(*) FROM pages'),
        execute('SELECT count(*) FROM queues'),
        execute(
          `SELECT vendor_name, status, summary, created_by, duration_ms, run_at
           FROM sync_logs ORDER BY run_at DESC LIMIT $1`,
          [limit]
        ),
        execute(
          `SELECT vendor_name, status, summary, duration_ms, run_at
           FROM sync_logs WHERE created_by = 'webhook' ORDER BY run_at DESC LIMIT 10`
        ),
      ]);

      const statusCounts = await execute(
        `SELECT status, count(*) FROM sync_logs GROUP BY status`
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        db: {
          product_cards: parseInt(cardCount.rows[0].count),
          pages: parseInt(pageCount.rows[0].count),
          queues: parseInt(queueCount.rows[0].count),
        },
        sync_summary: Object.fromEntries(statusCounts.rows.map(r => [r.status, parseInt(r.count)])),
        recent_activity: recentLogs.rows,
        webhook_events: webhookLogs.rows,
        server_time: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('🚨 [MONITOR] Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // If no API endpoint matched
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
}

// Create HTTP server
const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // Handle API requests
  if (req.url.startsWith('/api/')) {
    handleApiRequest(req, res);
    return;
  }

  // Handle static files
  let filePath;
  if (req.url === '/') {
    filePath = path.join(__dirname, 'public', 'vendors.html');
  } else if (req.url === '/dbinterface') {
    filePath = path.join(__dirname, 'public', 'dbinterface.html');
  } else {
    filePath = path.join(__dirname, 'public', req.url);
  }

  const extname = path.extname(filePath);
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Specifically allow favicon.ico requests to fail silently for now
        if (req.url === '/favicon.ico') {
            res.writeHead(204); // No Content
            res.end();
            return;
        }
        console.warn(`Static file not found: ${filePath}`);
        res.writeHead(404);
        res.end('File not found');
      } else {
        console.error(`Server Error reading static file: ${err.code}`);
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
