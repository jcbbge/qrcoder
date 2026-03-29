/**
 * Test script for QRCoder vendor sync
 * A simplified version to test the workflow without excessive logging
 */

import 'dotenv/config';
import * as shopify from '../src/shopify.js';
import * as db from '../src/db.js';

// Configuration
const MAX_PRODUCTS_PER_PAGE = 10;
const STORE_URL = process.env.SHOPIFY_SHOP_NAME || 'harding-art-show';
const TEST_VENDOR = "Ben Caldwell";
const TEST_LIMIT = 5; // Limit to just a few products for testing

async function main() {
  try {
    console.log(`🔄 TEST: Starting test for vendor: ${TEST_VENDOR} (limited to ${TEST_LIMIT} products)`);

    // Get products for vendor
    console.log(`📋 TEST: Fetching ${TEST_LIMIT} products for vendor: ${TEST_VENDOR}`);
    const { products } = await shopify.getPaginatedProductsByVendor(TEST_VENDOR, null);
    const limitedProducts = products.slice(0, TEST_LIMIT);

    console.log(`✅ TEST: Found ${products.length} products (using ${limitedProducts.length} for test)`);
    console.log(`📋 TEST: Product sample:`, limitedProducts[0]?.title || "No products found");

    // Create product cards
    console.log(`🔄 TEST: Syncing product cards`);

    // Get existing Product Cards by Shopify IDs to avoid duplicates
    const shopifyIds = limitedProducts.map(product => product.id);
    const existingCards = await db.productCards.getProductCardsByShopifyIds(shopifyIds);

    console.log(`🔄 TEST: Found ${existingCards.length} existing Product Cards out of ${limitedProducts.length} products`);

    // Create a map of existing cards by Shopify ID for quick lookup
    const existingCardMap = new Map();
    existingCards.forEach(card => {
      existingCardMap.set(card.shopify_id, card);
    });

    // Track stats
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const syncedCards = [];

    for (const product of limitedProducts) {
      try {
        // Extract price from the product data
        const shopifyPrice = product.priceRangeV2?.minVariantPrice?.amount || '0.00';

        // Create the Shopify product URL
        const shopifyUrl = `https://${STORE_URL}.myshopify.com/products/${product.handle}`;

        // Define the product card data
        const productCardData = {
          shopify_id: product.id,
          product_name: product.title,
          artist_name: product.vendor,
          price: shopifyPrice.toString(),
          image_url: product.featuredImage?.url || null,
          onlineStoreUrl: shopifyUrl,
          status: 'unprocessed'
        };

        // Check if this product already has a card
        if (existingCardMap.has(product.id)) {
          // Get the existing card
          const existingCard = existingCardMap.get(product.id);

          // Check if price has changed (Shopify is source of truth)
          const existingPrice = existingCard.price || '0.00';
          const existingPriceNum = parseFloat(existingPrice);
          const shopifyPriceNum = parseFloat(shopifyPrice);

          if (Math.abs(existingPriceNum - shopifyPriceNum) > 0.01) {
            // Price has changed significantly, update the record
            console.log(`🔄 TEST: Price changed for ${product.title} from $${existingPriceNum.toFixed(2)} to $${shopifyPriceNum.toFixed(2)}`);

            // Update the record in the database
            await db.execute(
              `UPDATE product_cards SET
                price = $1,
                product_name = $2,
                artist_name = $3,
                image_url = $4,
                onlineStoreUrl = $5,
                updated_at = CURRENT_TIMESTAMP
               WHERE shopify_id = $6
               RETURNING *`,
              [
                shopifyPrice.toString(),
                product.title,
                product.vendor,
                product.featuredImage?.url || null,
                shopifyUrl,
                product.id
              ]
            );

            // Update the existing card with new values
            const updatedCard = {
              ...existingCard,
              price: shopifyPrice.toString(),
              product_name: product.title,
              artist_name: product.vendor,
              image_url: product.featuredImage?.url || null,
              onlineStoreUrl: shopifyUrl
            };

            syncedCards.push(updatedCard);
            updated++;
            console.log(`
