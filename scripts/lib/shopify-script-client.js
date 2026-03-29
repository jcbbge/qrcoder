import 'dotenv/config';
import fetch from 'node-fetch';

// --- Load Shopify credentials ---
const shopName = process.env.SHOPIFY_SHOP_NAME;
const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_API_URL = `https://${shopName}.myshopify.com/admin/api/2023-10/graphql.json`;

// Basic check for credentials
if (!shopName || !accessToken) {
  console.error('🚨 SHOPIFY SCRIPT CLIENT ERROR: SHOPIFY_SHOP_NAME and SHOPIFY_ADMIN_API_ACCESS_TOKEN must be set in .env file');
  // Consider throwing an error or exiting if critical for all scripts using this client
  // throw new Error('Shopify credentials missing in .env');
}

/**
 * Internal function to execute a GraphQL query against the Shopify API.
 * Adapted from the logic previously seen in src/shopify.js.
 *
 * @param {string} query - GraphQL query string
 * @param {Object} variables - Variables for the query (optional)
 * @returns {Promise<Object>} - The 'data' part of the JSON response from Shopify
 * @throws {Error} - If the API request fails or returns GraphQL errors
 */
async function executeQuery(query, variables = {}) {
  // Shorten log prefix
  console.log(`[Shopify] Executing query (variables: ${Object.keys(variables).length > 0})`);

  if (!shopName || !accessToken) {
     throw new Error('Shopify API credentials not configured properly. Check your .env file.');
  }

  try {
    const response = await fetch(SHOPIFY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Shorten log prefix
      console.error(`[Shopify] API Error (${response.status}): ${errorText}`);
      throw new Error(`Shopify API request failed with status ${response.status}`);
    }

    const responseData = await response.json();

    if (responseData.errors) {
      // Shorten log prefix
      console.error('[Shopify] GraphQL Errors:', responseData.errors);
      throw new Error(responseData.errors.map((e) => e.message).join(', '));
    }

    return responseData.data;

  } catch (error) {
    // Shorten log prefix
    console.error('[Shopify] Query execution failed:', error);
    throw error;
  }
}

/**
 * Fetches all vendor names from the Shopify store.
 *
 * @export
 * @returns {Promise<string[]>} A sorted array of vendor names.
 * @throws {Error} If the API request fails.
 */
export async function getAllShopifyVendors() {
  console.log("[Shopify] Fetching all vendors...");
  const startTime = Date.now();

  let hasNextPage = true;
  let cursor = null;
  let allVendors = new Set();
  let totalProducts = 0;
  let page = 1;

  while (hasNextPage) {
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

    try {
      const data = await executeQuery(query, { cursor });

      if (!data?.shop?.products?.edges) {
        console.log("[Shopify] No products found in response.");
        return [];
      }

      const products = data.shop.products;
      const pageProducts = products.edges.length;
      totalProducts += pageProducts;

      // Add vendors from this page
      products.edges.forEach(edge => {
        if (edge.node.vendor) {
          allVendors.add(edge.node.vendor);
        }
      });

      console.log(`[Shopify] Page ${page}: Found ${pageProducts} products (${allVendors.size} unique vendors so far)`);

      // Update pagination info
      hasNextPage = products.pageInfo.hasNextPage;
      cursor = products.pageInfo.endCursor;
      page++;

      // Add a small delay to avoid rate limits
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      console.error('[Shopify] Error fetching vendors:', error.message);
      throw new Error(`Failed to fetch vendors: ${error.message}`);
    }
  }

  const vendors = Array.from(allVendors).sort();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Shopify] Completed vendor fetch. Total: ${vendors.length} vendors from ${totalProducts} products (${elapsed}s)`);

  return vendors;
}

/**
 * Fetches products for a specific vendor, handling pagination.
 * Adapted from getPaginatedProductsByVendor in src/shopify.js.
 *
 * @export
 * @param {string} vendorName - The name of the vendor.
 * @param {string | null} [cursor=null] - The pagination cursor from the previous page.
 * @param {boolean} [lightweight=true] - If true, fetches fewer product fields.
 * @returns {Promise<{products: object[], pageInfo: {hasNextPage: boolean, endCursor: string | null}}>}
 * @throws {Error} If vendorName is missing or the API request fails.
 */
export async function getShopifyProductsByVendorPaginated(vendorName, cursor = null, lightweight = true) {
  console.log(`[Shopify] Fetching products for vendor: "${vendorName}"... (paginated)`);
  let allProducts = [];
  let currentPage = 0;
  const startTime = Date.now();
  let hasNextPage = true;
  let currentCursor = cursor;

  if (!vendorName) {
    console.error('[Shopify] CRITICAL: Vendor name missing');
    throw new Error('Vendor name is required');
  }

  // Using lightweight query for scripts by default, adjust if needed
  const query = `
    query getPaginatedProductsByVendor($query: String!, $cursor: String) {
      shop {
        products(first: 250, after: $cursor, query: $query) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          edges {
            cursor
            node {
              id
              title
              vendor
              handle
              status
              onlineStoreUrl
              ${lightweight ? `
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              featuredImage {
                url(transform: {maxWidth: 100, maxHeight: 100, crop: CENTER})
              }` : `
              descriptionHtml
              createdAt
              updatedAt
              featuredImage {
                url
                altText
              }
              images(first: 3) {
                edges {
                  cursor
                  node {
                    url
                    altText
                  }
                }
              }
              `}
            }
          }
        }
      }
    }
  `;

  while (hasNextPage) {
    currentPage++;
    const variables = {
      query: `vendor:"${vendorName}" AND status:active`,
      cursor: currentCursor
    };

    try {
      const data = await executeQuery(query, variables);

      if (!data?.shop?.products) {
        console.error(`[Shopify] ERROR: No data returned for vendor "${vendorName}" on page ${currentPage}`);
        throw new Error('No data returned from Shopify API');
      }

      const products = data.shop.products.edges.map(edge => {
        const product = edge.node;
        // Ensure ID is in the format we expect (remove 'gid://shopify/Product/')
        product.id = product.id.split('/').pop();
        // Store the cursor with the product for potential backwards pagination
        product.cursor = edge.cursor;
        return product;
      });

      allProducts = [...allProducts, ...products];
      console.log(`[Shopify] Page ${currentPage}: Fetched ${products.length} products for "${vendorName}". Running total: ${allProducts.length}`);

      // Update pagination info for next iteration
      const pageInfo = data.shop.products.pageInfo;
      hasNextPage = pageInfo.hasNextPage;
      currentCursor = pageInfo.endCursor;

      // Add a small delay to avoid rate limits
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between pages
      }

    } catch (error) {
      console.error(`[Shopify] ERROR on page ${currentPage}:`, error);
      throw error;
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Shopify] Completed fetch for "${vendorName}". Total: ${allProducts.length} products (${elapsed}s)`);

  return {
    products: allProducts,
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: true,
      startCursor: allProducts[0]?.cursor,
      endCursor: currentCursor
    }
  };
}

/**
 * Fetches products for a specific vendor *by ID*, handling pagination.
 * Note: Shopify doesn't have a direct vendor ID filter, so this uses a `query` argument.
 * This might be less efficient than filtering by vendor name depending on Shopify's indexing.
 *
 * @export
 * @param {string} vendorId - The Shopify Vendor GID (e.g., 'gid://shopify/Vendor/123').
 * @param {string | null} [cursor=null] - The pagination cursor.
 * @param {boolean} [lightweight=true] - If true, fetches fewer product fields.
 * @returns {Promise<{products: object[], pageInfo: {hasNextPage: boolean, endCursor: string | null}}>}
 * @throws {Error} If vendorId is missing or the API request fails.
 */
export async function getShopifyProductsByVendorIdPaginated(vendorId, cursor = null, lightweight = true) {
  console.log(`[Shopify] Fetching products for vendor ID: "${vendorId}"... (paginated)`);
  let allProducts = [];
  let currentPage = 0;
  const startTime = Date.now();
  let hasNextPage = true; // Initialize

  if (!vendorId) {
    throw new Error('Vendor ID is required');
  }

  // The GraphQL query is the same structure, only the 'query' variable changes
  const query = `
    query getPaginatedProductsById($query: String!, $cursor: String) {
      products(first: 250, after: $cursor, query: $query) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            vendor
            handle
            status
            onlineStoreUrl
            ${lightweight ? `
            priceRangeV2 { minVariantPrice { amount currencyCode } }
            featuredImage { url(transform: {maxWidth: 100, maxHeight: 100, crop: CENTER}) }` : `
            descriptionHtml createdAt updatedAt
            featuredImage { url altText }
            images(first: 3) { edges { node { url altText } } }
            `}
          }
        }
      }
    }
  `;

  do {
    currentPage++;
    // Construct the query variable using the vendor ID
    // IMPORTANT: Check if Shopify actually supports `vendor_id:` syntax in the product query.
    // If not, this function might not work as expected or might need adjustment.
    // Common alternatives might involve tags or metafields if vendor ID isn't directly queryable.
    const variables = {
      query: `vendor_id:\"${vendorId}\" AND status:active`, // Added AND status:active
      cursor: cursor
    };

    console.log(`[Shopify]  (Attempting query: ${variables.query})`); // Log the query being tried

    try {
      const data = await executeQuery(query, variables);

      if (!data || !data.products || !data.products.pageInfo) {
        console.warn(`[Shopify] No products found on page ${currentPage} or invalid response for vendor ID "${vendorId}".`);
        cursor = null;
        hasNextPage = false;
      } else {
        const products = data.products.edges.map(edge => edge.node);
        allProducts = allProducts.concat(products);
        if (currentPage % 5 === 0 && products.length > 0) {
             console.log(`[Shopify] ... fetched ${allProducts.length} products so far for ID "${vendorId}" (page ${currentPage})`);
        }
        cursor = data.products.pageInfo.endCursor;
        hasNextPage = data.products.pageInfo.hasNextPage;
      }
    } catch (error) {
      console.error(`[Shopify] Error fetching page ${currentPage} of products for vendor ID "${vendorId}":`, error.message);
      // Add basic retry or just re-throw?
      // For simplicity here, just re-throwing.
      throw error;
    }

  } while (hasNextPage);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Shopify] Finished fetching for ID "${vendorId}". Total: ${allProducts.length} products (${duration}s).`);

  return {
    products: allProducts,
    pageInfo: { hasNextPage: false, endCursor: cursor }
  };
}
