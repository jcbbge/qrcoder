# Sync Script Operations Checklist

## Pre-Sync: Vendor Resolution
- [ ] If `vendorName` is provided:
  - Skip vendor lookup, use provided name
- [ ] If `vendorName` is null/undefined:
  - Call `getAllShopifyVendors()` from `shopify-script-client.js`
  - Initialize tracking:
    ```javascript
    const startTime = Date.now();
    let totalProducts = 0;
    let page = 1;
    ```
  - Setup GraphQL query and parameters:
    ```javascript
    // Query definition
    const query = `
      query($cursor: String) {
        shop {
          products(first: 250, after: $cursor) {
            edges {
              node {
                vendor
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    // Query execution parameters
    const variables = { cursor };  // cursor is null initially

    // Headers for Shopify API
    const headers = {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN
    };
    ```
  - Handle pagination:
    - Start with cursor = null
    - While hasNextPage is true:
      1. Execute query: `await executeQuery(query, { cursor })`
      2. Validate response: `if (!data?.shop?.products?.edges) return []`
      3. Count products: `totalProducts += products.edges.length`
      4. Extract unique vendors from response
      5. Log progress: `Page ${page}: Found ${pageProducts} products (${allVendors.size} unique vendors so far)`
      6. Update cursor = pageInfo.endCursor
      7. Add 500ms delay between pages: `await new Promise(resolve => setTimeout(resolve, 500))`
      8. Increment page counter
      9. Handle errors:
         ```javascript
         catch (error) {
           console.error('[Shopify] Error fetching vendors:', error.message);
           throw new Error(`Failed to fetch vendors: ${error.message}`);
         }
         ```
  - Process results:
    - Collect unique vendors in Set
    - Convert to sorted array
    - Calculate duration: `((Date.now() - startTime) / 1000).toFixed(1)`
    - Log completion: `Total: ${vendors.length} vendors from ${totalProducts} products (${elapsed}s)`
    - Store total count: `summary.totalVendors = vendors.length`
  - For each vendor:
    ```javascript
    try {
      await processVendor(vendor, summary, triggeredBy);
      summary.processedVendors++;
    } catch (error) {
      summary.errors++;
      console.error(`Error processing vendor ${vendor}:`, error);
      // Continue with next vendor
    }
    ```
  - Track in summary object:
    ```javascript
    {
      totalVendors: vendors.length,    // Set before loop
      processedVendors: 0,             // Increment on success
      errors: 0                        // Increment on failure
    }
    ```
  - Final status determination:
    - 'SUCCESS': No errors
    - 'PARTIAL': Some vendors failed (errors > 0 but errors < totalVendors)
    - 'FAILURE': All vendors failed (errors === totalVendors)

## Initial Setup
- [ ] Take vendor name input
- [ ] Initialize summary object:
  ```javascript
  {
    totalNewProducts: 0,
    totalUpdatedProducts: 0,
    totalNewPages: 0,
    totalNewQueues: 0,
    createdProducts: [],
    updatedProducts: [],
    createdPages: [],
    createdQueues: [],
    totalVendors: 0,
    processedVendors: 0,
    errors: 0
  }
  ```

## 1. Get Shopify Products
- [ ] Call `getShopifyProductsByVendorPaginated(vendorName)`
- [ ] If no products found:
  - [ ] Log to sync_logs:
    ```sql
    INSERT INTO sync_logs (
      vendor_name, status, summary, details, created_by, duration_ms
    ) VALUES (
      $1,
      'SUCCESS',
      'No products found to sync',
      JSON.stringify({
        counts: { products_created: 0, products_updated: 0 },
        messages: ['No products found for vendor']
      }),
      triggeredBy,
      Date.now() - vendorStartTime
    )
    ```
  - [ ] Return early

## 2. Process Each Product
- [ ] Check if exists: `SELECT * FROM product_cards WHERE shopify_id = $1`

### If Product is New:
- [ ] Insert new product:
  ```sql
  INSERT INTO product_cards (
    shopify_id, product_name, artist_name, price,
    image_url, "onlineStoreUrl", status,
    custom_data, metrics
  ) VALUES (
    $1, $2, $3, $4, $5, $6,
    'unassigned',
    JSON.stringify({ syncSource: 'shopify', lastSync: timestamp }),
    JSON.stringify({ scanCount: 0, lastScanAt: null })
  )
  ```
- [ ] Add to summary.createdProducts:
  ```javascript
  {
    id: result.rows[0].id,
    name: result.rows[0].product_name,
    price: result.rows[0].price,
    shopify_id: result.rows[0].shopify_id,
    timestamp: result.rows[0].created_at,
    message: `Created product: ${name} (Shopify ID: ${id}, Price: ${price})`
  }
  ```

### If Product Exists:
- [ ] Check if needs update (name, artist, price, URL changed)
- [ ] If update needed:
  ```sql
  UPDATE product_cards
  SET product_name = $1,
      artist_name = $2,
      price = $3,
      "onlineStoreUrl" = $4,
      custom_data = JSON.stringify({...existing, lastSync: timestamp})
  WHERE id = $5
  ```
- [ ] Add to summary.updatedProducts:
  ```javascript
  {
    id: result.rows[0].id,
    name: result.rows[0].product_name,
    price: result.rows[0].price,
    shopify_id: result.rows[0].shopify_id,
    timestamp: result.rows[0].updated_at,
    message: `Updated product: ${name} (Shopify ID: ${id}, Price: ${price})`
  }
  ```

## 3. Create Pages
- [ ] For each chunk of MAX_PRODUCTS_PER_PAGE (10) cards:
  ```sql
  INSERT INTO pages (
    name, type, status, card_ids, custom_data
  ) VALUES (
    ${vendorName}_${timestamp},
    'auto',
    'ready',
    JSON.stringify(pageCardIds),
    JSON.stringify({
      vendorName,
      syncTimestamp: timestamp,
      syncType: 'bulk'
    })
  )
  ```
- [ ] For each card in page:
  ```sql
  UPDATE product_cards
  SET status = 'assigned',
      page_id = $1,
      custom_data = JSON.stringify({
        ...customData,
        pageAssignment: { timestamp, pageId }
      })
  WHERE id = $2
  ```
- [ ] Add to summary.createdPages:
  ```javascript
  {
    id: page.id,
    name: page.name,
    timestamp: page.created_at,
    message: `Created page: ${name} (ID: ${id})`
  }
  ```

## 4. Create Queue
- [ ] Create queue for all pages:
  ```sql
  INSERT INTO queues (
    name, status, page_ids, custom_data
  ) VALUES (
    ${vendorName}_${timestamp},
    'pending',
    JSON.stringify(pageIds),
    JSON.stringify({
      vendorName,
      syncTimestamp: timestamp,
      pageCount: pageIds.length,
      syncType: 'bulk'
    })
  )
  ```
- [ ] For each page in queue:
  ```sql
  UPDATE pages
  SET queue_id = $1,
      custom_data = JSON.stringify({
        ...customData,
        queueAssignment: { timestamp, queueId }
      })
  WHERE id = $2
  ```
- [ ] Add to summary.createdQueues:
  ```javascript
  {
    id: queue.id,
    name: queue.name,
    timestamp: queue.created_at,
    message: `Created queue: ${name} (ID: ${id})`
  }
  ```

## 5. Create Sync Log
- [ ] Calculate duration: `Date.now() - startTime`
- [ ] Create summary string: "${created} new, ${updated} updated..."
- [ ] Insert sync log:
  ```sql
  INSERT INTO sync_logs (
    vendor_name, status, summary, details, created_by, duration_ms
  ) VALUES (
    $1,
    'success',
    summaryString,
    JSON.stringify(details),
    'script',
    durationMs
  )
  ```

## 6. Return Results
- [ ] Return complete summary object with all operations

## Error Handling
- [ ] If any operation fails:
  - [ ] Log error to sync_logs with status 'FAILURE'
  - [ ] Include error details in sync log
  - [ ] Increment summary.errors
  - [ ] Continue processing remaining items where possible
