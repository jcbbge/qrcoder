/**
 * Vendor Check Script
 *
 * Purpose: Checks Shopify vendors and their products against the Neon DB 'product_cards' table.
 * Generates a report file 'vendor-check-latest.txt' detailing matched and missing products.
 * This script performs READ-ONLY operations.
 *
 * Run with:
 * node scripts/vendor-check.js              # Checks ALL vendors
 * node scripts/vendor-check.js "Vendor Name"  # Checks a SINGLE vendor (name must be exact match)
 */

import 'dotenv/config';
// Use the new script-specific Shopify client
import {
  getAllShopifyVendors,
  getShopifyProductsByVendorPaginated
} from './lib/shopify-script-client.js';
// Use the new script-specific Neon client
import { getProductCardsByShopifyIds } from './lib/neon-script-client.js';
import fs from 'fs';                         // For file writing
import path from 'path';                       // For resolving file path
// No longer need fetch or direct credentials here

// --- Configuration ---
// Base name for report files
const REPORT_BASE_NAME = 'vendor-check-report';

// --- Helper Function: Sanitize name for filename ---
function sanitizeFilename(name) {
  // Replace spaces with underscores, remove characters unsafe for filenames
  // Adjust the regex as needed for your OS/environment
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
}

// --- Helper Function: Generate timestamp string for filename ---
function generateTimestampForFilename() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

// --- Helper: Get All Vendors (Uses script-specific client) ---
async function getAllVendors() {
  // Use the imported function from the new client
  return await getAllShopifyVendors();
}

// --- Helper: Get All Products for a Vendor (Uses script-specific client) ---
async function getAllVendorProducts(vendorName) {
  let allProducts = [];
  let cursor = null;
  let hasNextPage = true;
  let pageCount = 0;
  const MAX_PAGES = 50; // Safety break for unexpected loops

  console.log(`    Fetching Shopify products for vendor "${vendorName}" (paginated)...`);

  while (hasNextPage && pageCount < MAX_PAGES) {
    pageCount++;
    try {
      // Use the imported function from the new client
      const result = await getShopifyProductsByVendorPaginated(vendorName, cursor);

      if (!result || !result.products || !result.pageInfo) {
        // The client function should ideally handle basic error checking,
        // but we can add extra safety here if needed.
        console.warn(`[Vendor Check] Warning: Invalid response structure from getShopifyProductsByVendorPaginated for vendor "${vendorName}", batch #${pageCount}.`);
        // Decide whether to break or continue if this happens
        hasNextPage = false; // Stop pagination on unexpected response
        continue;
      }

      const { products, pageInfo } = result;

      if (products.length > 0) {
         console.log(`      Batch #${pageCount}: Fetched ${products.length} products.`);
        allProducts = allProducts.concat(products);
      } else {
         console.log(`      Batch #${pageCount}: Fetched 0 products.`);
      }

      hasNextPage = pageInfo.hasNextPage;
      cursor = pageInfo.endCursor;

      // Small delay to be kind to the API - could also move this into the client if preferred
      if (hasNextPage) {
         await new Promise(resolve => setTimeout(resolve, 250));
      }

    } catch (error) {
      // Error logging is handled within the client, but we re-throw to stop this vendor's processing
      console.error(`❌ Error during product fetch loop for vendor "${vendorName}" (batch #${pageCount}):`, error.message);
      throw new Error(`Failed during product fetch for ${vendorName}: ${error.message}`);
    }
  }

   if (pageCount === MAX_PAGES && hasNextPage) {
     console.warn(`⚠️ Warning: Reached maximum page limit (${MAX_PAGES}) for vendor "${vendorName}". Product list may be incomplete.`);
   }

  console.log(`    Finished fetching. Total Shopify products for "${vendorName}": ${allProducts.length}`);
  return allProducts; // Array of { id, title, vendor, ... }
}

// --- Main Report Generation Function ---
async function generateVendorReport() {
  const targetVendor = process.argv[2];
  const currentTimestamp = generateTimestampForFilename();

  console.log('🚀 Starting Vendor Check Report Generation...');
  if (targetVendor) {
    console.log(`🎯 Targeting single vendor: "${targetVendor}"`);
  }

  // --- Determine Report Filename Pattern and New Filename ---
  let fileBase; // e.g., 'ALL' or 'Vendor_A'
  let filePattern; // e.g., 'vendor-check-report-ALL-*.txt'
  let newReportFilename; // e.g., 'vendor-check-report-ALL-20240727_103000.txt'

  if (targetVendor) {
    fileBase = sanitizeFilename(targetVendor);
  } else {
    fileBase = 'ALL';
  }

  filePattern = `${REPORT_BASE_NAME}-${fileBase}-*.txt`;
  newReportFilename = `${REPORT_BASE_NAME}-${fileBase}-${currentTimestamp}.txt`;
  const newReportFilePath = path.resolve(newReportFilename);
  console.log(`📝 New report filename: ${newReportFilename}`);
  // ---

  // --- Find and Delete Previous Report File(s) for this context ---
  try {
    const currentDir = '.'; // Or specify another directory if needed
    const files = fs.readdirSync(currentDir);
    const reportFileRegex = new RegExp(`^${REPORT_BASE_NAME}-${fileBase}-\\d{8}_\\d{6}\\.txt$`); // Matches the pattern

    files.forEach(file => {
      if (reportFileRegex.test(file)) {
        // Found a previous report file for this context
        const oldFilePath = path.resolve(currentDir, file);
        console.log(`   🗑️ Deleting previous report file: ${file}`);
        try {
          fs.unlinkSync(oldFilePath);
        } catch (unlinkError) {
          console.error(`   ⚠️ Error deleting old report file ${oldFilePath}:`, unlinkError.message);
          // Decide if this is critical - maybe just warn?
        }
      }
    });
  } catch (readDirError) {
    console.error(`⚠️ Error reading directory to find old report files:`, readDirError.message);
    // Proceeding without deleting old files if directory read fails
  }
  // ---

  const reportLines = [];
  const reportTimestamp = new Date().toISOString();

  // --- Report Header ---
  reportLines.push('======================================================================');
  reportLines.push(` Shopify <> Neon DB Product Card Sync Status Report`);
  if (targetVendor) {
     reportLines.push(` Target Vendor: ${targetVendor}`);
  }
  reportLines.push(` Report Generated: ${reportTimestamp}`);
  reportLines.push('======================================================================');
  reportLines.push('');
  reportLines.push("Purpose: This report identifies products listed in Shopify that are missing corresponding entries in the Neon DB 'product_cards' table.");
  reportLines.push('');

  let vendorsToProcess = [];
  let totalVendorsProcessed = 0;
  let totalShopifyProducts = 0;
  let totalMatchedCards = 0;
  let totalMissingCards = 0;

  try {
    // 1. Determine which vendors to process
    if (targetVendor) {
      vendorsToProcess = [targetVendor];
      console.log(`🔍 Processing only vendor: "${targetVendor}"`);
    } else {
      console.log(`🔍 Fetching all vendors to process...`);
      vendorsToProcess = await getAllVendors(); // Fetch all if no target specified
    }

    totalVendorsProcessed = vendorsToProcess.length;

    if (vendorsToProcess.length === 0) {
      const message = targetVendor
        ? `🛑 Vendor "${targetVendor}" not found or no vendors specified. Report generation stopped.`
        : '🛑 No vendors found in Shopify. Report generation stopped.';
      console.log(message);
      reportLines.push(message);
      // Write partial report and exit
      const reportContent = reportLines.join('\n');
      try {
        fs.writeFileSync(newReportFilePath, reportContent);
        console.log(`✅ Report successfully written to: ${newReportFilePath} (No vendors processed)`);
      } catch (writeError) {
        console.error(`❌ Error writing report file to ${newReportFilePath}:`, writeError.message);
      }
      return;
    }

    // 2. Process each vendor
    for (const vendorName of vendorsToProcess) {
      console.log(`\nProcessing Vendor: ${vendorName}`);
      reportLines.push(`----------------------------------------------------------------------`);
      reportLines.push(` Vendor: ${vendorName}`);
      reportLines.push(`----------------------------------------------------------------------`);
      const vendorStartTime = Date.now();
      let vendorShopifyProducts = [];
      let vendorMatchedCardsCount = 0;
      let vendorMissingCardsCount = 0;

      try {
        // 3. Get Shopify products for the vendor
        vendorShopifyProducts = await getAllVendorProducts(vendorName);
        totalShopifyProducts += vendorShopifyProducts.length;

        reportLines.push(`  --- Shopify Status ---`);
        reportLines.push(`    Total Products Found: ${vendorShopifyProducts.length}`);

        if (vendorShopifyProducts.length === 0) {
            reportLines.push(`  --- Neon DB Status ---`);
            reportLines.push(`    Status: Skipping DB check as no products were found in Shopify for this vendor.`);
            if (targetVendor && targetVendor === vendorName) {
                reportLines.push(`    NOTE: This was the specifically requested vendor.`);
            }
            reportLines.push(''); // Add spacing
            continue; // Move to the next vendor
        }

        // Prepare for DB check
        const shopifyProductIds = vendorShopifyProducts.map(p => p.id);
        const shopifyProductMap = new Map(vendorShopifyProducts.map(p => [p.id, p.title]));

        // 4. Check Neon DB for corresponding product_cards
        console.log(`    Checking Neon DB for ${shopifyProductIds.length} product IDs...`);
        reportLines.push(`  --- Neon DB Status ---`);
        let matchedCards = [];
        let dbError = null;
        try {
          matchedCards = await getProductCardsByShopifyIds(shopifyProductIds);
          console.log(`    Found ${matchedCards.length} matching product_cards in Neon DB.`);
          totalMatchedCards += matchedCards.length;
          vendorMatchedCardsCount = matchedCards.length;
          reportLines.push(`    Matched Product Cards: ${vendorMatchedCardsCount}`);
        } catch (err) {
            console.error(`    ❌ Error querying Neon DB for vendor "${vendorName}":`, err.message);
            dbError = err.message;
            reportLines.push(`    ERROR Querying DB: ${err.message}`);
        }

        const matchedCardMap = new Map(matchedCards.map(c => [c.shopify_id, c])); // Use correct column shopify_id

        // 5. Generate report section for the vendor
        const missingProductsInfo = [];
        for (const shopifyProductId of shopifyProductIds) {
          if (!matchedCardMap.has(shopifyProductId)) {
            missingProductsInfo.push({
              id: shopifyProductId,
              title: shopifyProductMap.get(shopifyProductId) || 'Unknown Title'
            });
          }
        }
        vendorMissingCardsCount = missingProductsInfo.length;
        totalMissingCards += vendorMissingCardsCount;

        reportLines.push(`    Missing Product Cards: ${vendorMissingCardsCount}`);

        if (missingProductsInfo.length > 0) {
          reportLines.push(`    --------------------------`);
          reportLines.push(`    ❌ PRODUCTS MISSING FROM NEON DB:`);
          missingProductsInfo.forEach(p => {
            reportLines.push(`      - Title: ${p.title}`);
            reportLines.push(`        Shopify ID: ${p.id}`);
          });
           reportLines.push(`    --------------------------`);
        } else if (dbError === null && vendorShopifyProducts.length > 0) {
             reportLines.push(`    ✅ Status: All ${vendorShopifyProducts.length} Shopify products have matching entries in Neon DB.`);
        } else if (vendorShopifyProducts.length === 0) {
            // Already handled above
        }

      } catch (vendorError) {
        console.error(`❌ Error processing vendor "${vendorName}":`, vendorError.message);
        reportLines.push(`  *** ERROR processing this vendor: ${vendorError.message} ***`);
         if (targetVendor && targetVendor === vendorName) {
             reportLines.push(`  NOTE: This was the specifically requested vendor. Processing failed.`);
         }
      } finally {
        const vendorEndTime = Date.now();
        const elapsedSeconds = ((vendorEndTime - vendorStartTime) / 1000).toFixed(2);
        reportLines.push(`  ----------------------`);
        reportLines.push(`  (Processing Time: ${elapsedSeconds}s)`);
        reportLines.push(''); // Add spacing after each vendor block
      }
    } // End vendor loop

  } catch (error) {
    console.error('🚨 Top-Level Error during report generation:', error);
    reportLines.push('\n======================================================================');
    reportLines.push(`🚨 TOP-LEVEL ERROR DURING REPORT GENERATION: ${error.message}`);
    reportLines.push('   Report may be incomplete.');
    reportLines.push('======================================================================');
  } finally {
    // --- Report Footer / Grand Summary ---
    reportLines.push('======================================================================');
    reportLines.push(' Report Summary');
    reportLines.push('======================================================================');
    if (targetVendor && totalVendorsProcessed === 1) {
        reportLines.push(`   Vendor Processed:        "${vendorsToProcess[0]}"`);
        reportLines.push(`   Shopify Products Found:  ${totalShopifyProducts}`);
        reportLines.push(`   Neon DB Cards Matched:   ${totalMatchedCards}`);
        reportLines.push(`   Neon DB Cards Missing:   ${totalMissingCards} ❌`);
    } else if (targetVendor && totalVendorsProcessed === 0) {
        reportLines.push(`   Target Vendor:           "${targetVendor}" (Not Found/Processed)`);
        reportLines.push(`   Vendors Processed:       0`);
    } else {
        reportLines.push(`   Vendors Processed Count: ${totalVendorsProcessed}`);
        reportLines.push(`   Total Shopify Products:  ${totalShopifyProducts}`);
        reportLines.push(`   Total Neon DB Matched:   ${totalMatchedCards}`);
        reportLines.push(`   Total Neon DB Missing:   ${totalMissingCards} ❌`);
    }
    reportLines.push('======================================================================');

    console.log('\n🏁 Report Generation Complete.');
    const reportContent = reportLines.join('\n');
    try {
      fs.writeFileSync(newReportFilePath, reportContent);
      console.log(`✅ Report successfully written to: ${newReportFilePath}`);
    } catch (writeError) {
      console.error(`❌ Error writing report file to ${newReportFilePath}:`, writeError.message);
      console.error("   Report Content:");
      console.error(reportContent);
    }
  }
}

// Execute the report generation function
generateVendorReport();
