import 'dotenv/config';
import fetch from 'node-fetch';

// Load Shopify credentials from environment variables
const shopName = process.env.SHOPIFY_SHOP_NAME;
const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = '2023-10';

// Check if credentials are set
if (!shopName || !accessToken) {
  console.error('🚨 SHOPIFY INIT ERROR: SHOPIFY_SHOP_NAME and SHOPIFY_ADMIN_API_ACCESS_TOKEN must be set in .env file');
}

// Shopify API base URL - using latest version
const SHOPIFY_API_URL = `https://${shopName}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

/**
 * Execute a GraphQL query against the Shopify API
 * @param {string} query - GraphQL query string
 * @param {Object} variables - Variables for the query (optional)
 * @returns {Promise<Object>} - JSON response from Shopify
 */
export async function executeQuery(query, variables = {}) {
  console.log('🔥 SHOPIFY QUERY: Starting query execution');
  console.log('🔥 SHOPIFY QUERY: Variables:', JSON.stringify(variables, null, 2));
  console.log('🔥 SHOPIFY QUERY: Query preview:', query.slice(0, 100));

  try {
    console.log(`🔥 SHOPIFY QUERY: Making API request to: ${SHOPIFY_API_URL}`);

    if (!shopName || !accessToken) {
      console.error('🚨 SHOPIFY QUERY ERROR: Missing credentials');
      throw new Error('Shopify API credentials not configured properly. Check your .env file.');
    }

    const response = await fetch(SHOPIFY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      },
      body: JSON.stringify({
        query,
        variables
      })
    });

    console.log('🔥 SHOPIFY QUERY: Response status:', response.status);
    console.log('🔥 SHOPIFY QUERY: Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🚨 SHOPIFY QUERY ERROR:', errorText);
      throw new Error(`Shopify API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('🔥 SHOPIFY QUERY: Raw response data:', JSON.stringify(data, null, 2));

    if (data.errors) {
      console.error('🚨 SHOPIFY QUERY GRAPHQL ERRORS:', data.errors);
      throw new Error(data.errors.map(e => e.message).join(', '));
    }

    console.log('✅ SHOPIFY QUERY SUCCESS: Response processed');
    return data.data;
  } catch (error) {
    console.error('🚨 SHOPIFY QUERY ERROR:', error);
    throw error;
  }
}

/**
 * Get collections with their products
 * @param {number} limit - Number of collections to fetch
 * @returns {Promise<Array>} - Array of collections with products
 */
export async function getCollections(limit = 10) {
  // Using Shopify Admin API schema
  // Reference: https://shopify.dev/docs/api/admin-graphql/latest/objects/Collection
  const query = `{
    collections(first: ${limit}) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          updatedAt
          description
          products(first: 5) {
            # Get product count directly from connection
            # This is a workaround since productsCount is not a scalar
            edges {
              node {
                id
                title
                vendor
                tags
                updatedAt
                createdAt
                priceRangeV2 {
                  minVariantPrice {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
    }
  }`;

  const data = await executeQuery(query);

  if (!data || !data.collections || !data.collections.edges) {
    return [];
  }

  return data.collections.edges.map(edge => edge.node);
}

/**
 * Get recently updated products
 * @param {number} limit - Number of products to fetch
 * @returns {Promise<Array>} - Array of recent products
 */
export async function getRecentProducts(lightweight = true) {
  const query = lightweight ? `{
    products(first: 250, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          vendor
          status
          onlineStoreUrl
          updatedAt
          createdAt
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          featuredImage {
            url(transform: {maxWidth: 100, maxHeight: 100, crop: CENTER})
          }
        }
      }
    }
  }` : `{
    products(first: 250, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          vendor
          status
          onlineStoreUrl
          updatedAt
          createdAt
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          featuredImage {
            url
            altText
          }
          images(first: 3) {
            edges {
              node {
                url
                altText
              }
            }
          }
        }
      }
    }
  }`;

  const data = await executeQuery(query);

  if (!data || !data.products || !data.products.edges) {
    return [];
  }

  return data.products.edges.map(edge => edge.node);
}

/**
 * Get products from a specific collection
 * @param {string} collectionId - Shopify GID for the collection
 * @param {number} limit - Number of products to fetch
 * @returns {Promise<Array>} - Array of products in the collection
 */
export async function getProductsByCollection(collectionId, lightweight = true) {
  const query = lightweight ? `
    query getProductsByCollection($collectionId: ID!) {
      collection(id: $collectionId) {
        id
        title
        products(first: 250) {
          edges {
            node {
              id
              title
              handle
              vendor
              status
              onlineStoreUrl
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              featuredImage {
                url(transform: {maxWidth: 100, maxHeight: 100, crop: CENTER})
              }
            }
          }
        }
      }
    }
  ` : `
    query getProductsByCollection($collectionId: ID!) {
      collection(id: $collectionId) {
        id
        title
        products(first: 250) {
          edges {
            node {
              id
              title
              handle
              vendor
              status
              onlineStoreUrl
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              featuredImage {
                url
                altText
              }
              images(first: 3) {
                edges {
                  node {
                    url
                    altText
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    collectionId
  };

  const data = await executeQuery(query, variables);

  if (!data || !data.collection || !data.collection.products || !data.collection.products.edges) {
    return [];
  }

  return data.collection.products.edges.map(edge => edge.node);
}

/**
 * Get Shopify store statistics
 * @returns {Promise<Object>} - Statistics about the store
 */
export async function getShopifyStats() {
  const query = `{
    collections(first: 1) {
      edges {
        cursor
      }
      pageInfo {
        hasNextPage
      }
    }
    products(first: 1) {
      edges {
        cursor
      }
      pageInfo {
        hasNextPage
      }
    }
  }`;

  // This is a simplified approach - in a real app, you'd use the countDocuments feature
  // or maintain a separate database with accurate counts

  try {
    // Get collections count (approximate)
    const collections = await getCollections(250);
    const collectionsCount = collections.length;

    // Get recent products to estimate total
    const recentProducts = await getRecentProducts(250);
    const productsCount = recentProducts.length;

    // Per Shopify API docs: tags field is of type [String!]
    // Count and log all unique tags we find
    const allTags = new Set();
    recentProducts.forEach(product => {
      if (product.tags && Array.isArray(product.tags)) {
        product.tags.forEach(tag => allTags.add(tag));
      }
    });

    console.log(`Found ${allTags.size} unique tags:`, Array.from(allTags));

    // Count products with any tags (non-empty array)
    const taggedProducts = recentProducts.filter(product =>
      product.tags && Array.isArray(product.tags) && product.tags.length > 0
    ).length;

    console.log(`Found ${taggedProducts} products with tags out of ${recentProducts.length} total products`);

    // Get counts of specific tags we care about, based on what we found in the test output
    const tagCounts = {
      online: recentProducts.filter(product =>
        product.tags && Array.isArray(product.tags) &&
        product.tags.includes('online')
      ).length,
      commission: recentProducts.filter(product =>
        product.tags && Array.isArray(product.tags) &&
        product.tags.includes('commission')
      ).length
    };

    console.log('Tag counts:', tagCounts);

    return {
      collections: collectionsCount,
      products: productsCount,
      taggedProducts: taggedProducts,
      tagCounts: tagCounts,
      lastSync: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting Shopify stats:', error);
    throw error;
  }
}

/**
 * Get recent activity from Shopify (new collections, products, updates)
 * @param {number} limit - Number of activities to return
 * @returns {Promise<Array>} - Array of activity objects
 */
export async function getShopifyActivity(limit = 20) {
  try {
    // Get recent products (created or updated)
    const recentProducts = await getRecentProducts(limit);

    // Get collections to find new ones
    const collections = await getCollections(20);

    // Create activity objects
    const activities = [];

    // Process products
    recentProducts.forEach(product => {
      const created = new Date(product.createdAt);
      const updated = new Date(product.updatedAt);
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Find collection if any
      const collection = product.collections && product.collections.edges && product.collections.edges.length > 0
        ? product.collections.edges[0].node
        : null;

      // Format price if available
      let price = '';
      if (product.priceRangeV2 && product.priceRangeV2.minVariantPrice) {
        const { amount, currencyCode } = product.priceRangeV2.minVariantPrice;
        price = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currencyCode
        }).format(amount);
      }

      // If created recently, add as new product
      if (created > oneDayAgo) {
        activities.push({
          id: `product_new_${product.id}`,
          type: 'new_product',
          title: 'New Product Added',
          details: `Artwork: "${product.title}" by ${product.vendor}${price ? ` - ${price}` : ''}`,
          timestamp: product.createdAt,
          metadata: {
            productId: product.id,
            title: product.title,
            artistName: product.vendor,
            price: price,
            collectionId: collection ? collection.id : null,
            collectionTitle: collection ? collection.title : null
          }
        });
      }
      // If updated recently but not newly created, add as update
      else if (updated > oneDayAgo) {
        activities.push({
          id: `product_updated_${product.id}`,
          type: 'updated',
          title: 'Product Updated',
          details: `Updated: "${product.title}" by ${product.vendor}${price ? ` - ${price}` : ''}`,
          timestamp: product.updatedAt,
          metadata: {
            productId: product.id,
            title: product.title,
            artistName: product.vendor,
            price: price,
            collectionId: collection ? collection.id : null,
            collectionTitle: collection ? collection.title : null
          }
        });
      }
    });

    // Process collections (just check for recent updates as a simplification)
    collections.forEach(collection => {
      const updated = new Date(collection.updatedAt);
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      if (updated > twoDaysAgo) {
        // Use the number of products in the edges array as the count
        // In a real app, we could issue a separate query to get actual count
        const productCount = collection.products?.edges?.length || 0;

        activities.push({
          id: `collection_updated_${collection.id}`,
          type: 'new_collection',
          title: 'Collection Updated',
          details: `Artist Collection: "${collection.title}" (at least ${productCount} products)`,
          timestamp: collection.updatedAt,
          metadata: {
            collectionId: collection.id,
            title: collection.title,
            productCount: productCount
          }
        });
      }
    });

    // Sort by timestamp (newest first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit the number of activities
    return activities.slice(0, limit);
  } catch (error) {
    console.error('Error getting Shopify activity:', error);
    throw error;
  }
}

/**
 * Search for vendors in Shopify
 * Uses the Shopify Admin API productVendors query to get all vendors,
 * then filters them client-side based on the search query.
 *
 * Reference: https://shopify.dev/docs/api/admin-graphql/latest/queries/productVendors
 *
 * @param {string} query - Search query for vendor name
 * @returns {Promise<Array>} - Array of matching vendors
 */
export async function searchVendors(query) {
  console.log(`[Shopify API] searchVendors called with query: "${query}"`);

  if (!query || query.length < 2) {
    console.log(`[Shopify API] Invalid query length: ${query?.length} chars`);
    throw new Error('Search query must be at least 2 characters long');
  }

  // Use the dedicated productVendors query as per Shopify documentation:
  // https://shopify.dev/docs/api/admin-graphql/latest/queries/productVendors
  const searchQuery = `
    query {
      shop {
        productVendors(first: 250) {
          edges {
            node
          }
        }
      }
    }
  `;

  // No variables needed for this query
  const variables = {};

  console.log(`[Shopify API] Using productVendors query from Shopify Admin API documentation`);

  console.log(`[Shopify API] Constructing GraphQL query with variables:`, variables);

  try {
    console.log(`[Shopify API] Executing GraphQL query to search vendors...`);

    // Get first page of products
    const data = await executeQuery(searchQuery, variables);
    console.log(`[Shopify API] GraphQL query execution complete`);

    if (!data) {
      console.log(`[Shopify API] No data returned from GraphQL query`);
      return [];
    }

    if (!data.shop || !data.shop.productVendors || !data.shop.productVendors.edges) {
      console.log(`[Shopify API] No vendors found in GraphQL response`);
      return [];
    }

    console.log(`[Shopify API] Found ${data.shop.productVendors.edges.length} total vendors`);

    // Extract vendors from the results - the node is the vendor name string
    const vendorArray = data.shop.productVendors.edges.map(edge => edge.node);

    console.log(`[Shopify API] Extracted ${vendorArray.length} vendor names from response`);

    // Sort the vendors alphabetically
    vendorArray.sort();
    console.log(`[Shopify API] Found ${vendorArray.length} total unique vendors from current batch`);

    // Now we need to filter the vendors based on the search query
    console.log(`[Shopify API] Filtering for vendors that start with "${query}" (case-insensitive)...`);

    // Filter vendors that start with the search query (case-insensitive)
    const lowerQuery = query.toLowerCase();
    const filteredVendors = vendorArray.filter(vendor =>
      vendor.toLowerCase().startsWith(lowerQuery)
    );

    // Log filtered vendors for debugging
    console.log(`[Shopify API] Filtered down to ${filteredVendors.length} vendors matching "${query}":`);
    filteredVendors.forEach(vendor => {
      console.log(`[Shopify API]   - ${vendor}`);
    });

    console.log(`[Shopify API] Returning ${filteredVendors.length} filtered vendors`);
    return filteredVendors;
  } catch (error) {
    console.error(`[Shopify API] Error searching for vendors:`, error);
    throw error;
  }
}

/**
 * Get products for a specific vendor, filtered by inperson tag
 * Uses the Shopify GraphQL API to fetch products for a specific vendor that
 * have the 'inperson' tag. Includes comprehensive image handling with fallbacks
 * to ensure proper display in the UI.
 *
 * @param {string} vendorName - Name of the vendor to get products for
 * @returns {Promise<Array>} - Array of products for the vendor with inperson tag
 */
export async function getProductsByVendor(vendorName) {
  console.log('🔥 [SHOPIFY] Starting vendor product fetch for:', vendorName);

  if (!vendorName) {
    console.error('🚨 [SHOPIFY] Vendor name missing');
    throw new Error('Vendor name is required');
  }

  const query = `
    query getProductsByVendor($query: String!) {
      products(first: 50, query: $query) {
        edges {
          node {
            id
            title
            vendor
            tags
            handle
            createdAt
            updatedAt
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 1) {
              edges {
                node {
                  price
                  compareAtPrice
                }
              }
            }
            featuredImage {
              url
              altText
              originalSrc
              transformedSrc
            }
            images(first: 1) {
              edges {
                node {
                  url
                  originalSrc
                  transformedSrc
                }
              }
            }
            onlineStoreUrl
          }
        }
      }
    }
  `;

  const variables = {
    query: `vendor:"${vendorName}" AND status:active`
  };

  console.log('🔥 [SHOPIFY] Executing query with variables:', variables);

  try {
    const data = await executeQuery(query, variables);
    console.log('🔥 [SHOPIFY] Raw API response:', JSON.stringify(data, null, 2));

    if (!data) {
      console.error('🚨 [SHOPIFY] No data returned');
      throw new Error('No data returned from Shopify API');
    }

    if (!data.products || !data.products.edges) {
      console.error('🚨 [SHOPIFY] Invalid response structure:', data);
      throw new Error('Invalid response structure from Shopify API');
    }

    console.log(`✅ [SHOPIFY] Found ${data.products.edges.length} products`);

    const products = data.products.edges.map(edge => {
      const product = edge.node;
      console.log('🔥 [SHOPIFY] Processing product:', {
        id: product.id,
        title: product.title,
        priceRangeV2: product.priceRangeV2,
        variantPrice: product.variants?.edges?.[0]?.node?.price
      });

      // Get price from variant first, fall back to price range
      const price = product.variants?.edges?.[0]?.node?.price ||
                    product.priceRangeV2?.minVariantPrice?.amount;

      console.log('🔥 [SHOPIFY] Extracted price:', {
        id: product.id,
        variantPrice: product.variants?.edges?.[0]?.node?.price,
        priceRangeAmount: product.priceRangeV2?.minVariantPrice?.amount,
        finalPrice: price
      });

      return {
        ...product,
        price: price
      };
    });

    console.log('✅ [SHOPIFY] Returning processed products:',
      products.map(p => ({
        id: p.id,
        title: p.title,
        price: p.price
      }))
    );

    return products;
  } catch (error) {
    console.error('🚨 [SHOPIFY] API Error:', error);
    throw error;
  }
}

/**
 * Get products by vendor with pagination support
 * @param {string} vendorName - Name of the vendor to get products for
 * @param {string} cursor - Cursor for pagination
 * @param {boolean} lightweight - Whether to use lightweight query (default: true)
 * @returns {Promise<Object>} - Paginated products and pagination info
 */
export async function getPaginatedProductsByVendor(vendorName, cursor = null, lightweight = true) {
  console.log(`[Shopify API] getPaginatedProductsByVendor called for vendor: "${vendorName}", cursor: ${cursor || 'null'}`);

  if (!vendorName) {
    throw new Error('Vendor name is required');
  }

  // Use either lightweight or full query based on the lightweight parameter
  const query = lightweight ? `
    query getPaginatedProductsByVendor($query: String!, $cursor: String) {
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
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            featuredImage {
              url(transform: {maxWidth: 100, maxHeight: 100, crop: CENTER})
            }
          }
        }
      }
    }
  ` : `
    query getPaginatedProductsByVendor($query: String!, $cursor: String) {
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
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            featuredImage {
              url
              altText
            }
            images(first: 3) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    query: `vendor:"${vendorName}"`,
    cursor: cursor
  };

  console.log(`[Shopify API] Executing paginated query for vendor products...`);
  const data = await executeQuery(query, variables);

  if (!data || !data.products || !data.products.edges) {
    return {
      products: [],
      pageInfo: { hasNextPage: false, endCursor: null }
    };
  }

  console.log(`[Shopify API] Found ${data.products.edges.length} products in current page`);

  const products = data.products.edges.map(edge => edge.node);

  return {
    products,
    pageInfo: data.products.pageInfo
  };
}

/**
 * Get a specific product by its ID
 * Fetches a single product from Shopify by its numeric ID
 * Includes comprehensive image handling and data formatting
 *
 * @param {string} productId - Numeric ID of the product to fetch
 * @returns {Promise<Object>} - Product object with formatted data
 */
export async function getProductById(productId) {
  console.log(`[Shopify API] getProductById called with ID: "${productId}"`);

  if (!productId) {
    console.log(`[Shopify API] Error: Product ID is missing`);
    throw new Error('Product ID is required');
  }

  const query = `
    query getProductById($id: ID!) {
      product(id: $id) {
        id
        title
        vendor
        tags
        handle
        description
        createdAt
        updatedAt
        onlineStoreUrl
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        featuredImage {
          url
          altText
          originalSrc
          transformedSrc
        }
        images(first: 1) {
          edges {
            node {
              url
              originalSrc
              transformedSrc
            }
          }
        }
      }
    }
  `;

  // Convert numeric ID to Shopify's GraphQL global ID format if needed
  let gqlId = productId;
  if (!productId.includes('/')) {
    gqlId = `gid://shopify/Product/${productId}`;
  }

  const variables = {
    id: gqlId
  };

  console.log(`[Shopify API] Constructing GraphQL query with variables:`, variables);

  try {
    console.log(`[Shopify API] Executing GraphQL query to get product...`);
    const data = await executeQuery(query, variables);
    console.log(`[Shopify API] GraphQL query execution complete`);

    if (!data || !data.product) {
      console.log(`[Shopify API] No product found with ID: ${productId}`);
      throw new Error(`Product not found with ID: ${productId}`);
    }

    const product = data.product;
    console.log(`[Shopify API] Found product: ${product.title}`);

    // Format price if available
    let formattedPrice = 'Price not available';
    let rawPrice = null;
    let currency = 'USD';

    if (product.priceRangeV2 && product.priceRangeV2.minVariantPrice) {
      const { amount, currencyCode } = product.priceRangeV2.minVariantPrice;
      rawPrice = amount;
      currency = currencyCode;
      formattedPrice = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode
      }).format(amount);
    }

    // Get the best available image URL
    let imageUrl = null;
    if (product.featuredImage) {
      // Log available image properties for debugging
      console.log(`[Shopify API] Image properties available for "${product.title}":`);
      console.log(`[Shopify API]   - featuredImage.url: ${product.featuredImage.url || 'null'}`);
      console.log(`[Shopify API]   - featuredImage.originalSrc: ${product.featuredImage.originalSrc || 'null'}`);
      console.log(`[Shopify API]   - featuredImage.transformedSrc: ${product.featuredImage.transformedSrc || 'null'}`);

      // Try each in order until we find one
      imageUrl = product.featuredImage.transformedSrc ||
                product.featuredImage.originalSrc ||
                product.featuredImage.url;
    }

    // If no featuredImage, try the first image in the images array
    if (!imageUrl && product.images && product.images.edges && product.images.edges.length > 0) {
      const firstImage = product.images.edges[0].node;
      console.log(`[Shopify API] Falling back to first image in images array for "${product.title}"`);
      imageUrl = firstImage.transformedSrc || firstImage.originalSrc || firstImage.url;
    }

    const formattedProduct = {
      id: product.id,
      title: product.title,
      vendor: product.vendor,
      tags: product.tags,
      handle: product.handle,
      description: product.description,
      price: formattedPrice,
      rawPrice: rawPrice,
      currency: currency,
      imageUrl: imageUrl,
      imageAlt: product.featuredImage?.altText || product.title,
      productUrl: product.onlineStoreUrl || null,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };

    console.log(`[Shopify API] Processed product data for "${product.title}"`);
    return formattedProduct;
  } catch (error) {
    console.error(`[Shopify API] Error getting product with ID "${productId}":`, error);
    throw error;
  }
}

/**
 * Get all Shopify product IDs in batches
 * @param {string} vendorFilter - Optional vendor to filter by
 * @returns {Promise<Array>} - Array of all matching product IDs
 */
export async function getAllProductIds(vendorFilter = null) {
  console.log(`[Shopify API] getAllProductIds called with vendorFilter: ${vendorFilter || 'none'}`);

  let query = `
    query getProductIds($cursor: String, $limit: Int!) {
      products(first: $limit, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            vendor
          }
        }
      }
    }
  `;

  // Add vendor filter if specified
  let queryFilter = '';
  if (vendorFilter) {
    query = `
      query getProductIds($cursor: String, $limit: Int!, $query: String!) {
        products(first: $limit, after: $cursor, query: $query) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              vendor
            }
          }
        }
      }
    `;
    queryFilter = `vendor:"${vendorFilter}"`;
  }

  let hasNextPage = true;
  let cursor = null;
  const limit = 250; // Maximum allowed by Shopify
  const allProductIds = [];
  const DEV_MAX_PRODUCTS = 500;

  // Loop through all pages
  while (hasNextPage) {
    const variables = {
      cursor,
      limit
    };

    if (vendorFilter) {
      variables.query = queryFilter;
    }

    console.log(`[Shopify API] Fetching batch of product IDs, cursor: ${cursor || 'start'}`);
    const data = await executeQuery(query, variables);

    if (!data || !data.products || !data.products.edges) {
      break;
    }

    // Extract IDs
    const productIds = data.products.edges.map(edge => edge.node.id);
    allProductIds.push(...productIds);

    console.log(`[Shopify API] Found ${productIds.length} product IDs in batch, total so far: ${allProductIds.length}`);

    // Update pagination
    hasNextPage = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;

    // Safety break for testing
    if (process.env.NODE_ENV === 'development' && allProductIds.length >= DEV_MAX_PRODUCTS) {
      console.log(`[Shopify API] Development mode: Stopping after ${DEV_MAX_PRODUCTS} products to prevent excessive API calls`);
      allProductIds.length = DEV_MAX_PRODUCTS;
      break;
    }
  }

  console.log(`[Shopify API] Completed product ID collection: ${allProductIds.length} total IDs`);
  return allProductIds;
}

/**
 * Get all vendors from Shopify using the productVendors query
 * @returns {Promise<Array>} - Array of all vendor names, sorted
 */
export async function getAllShopifyVendors() {
  const query = `
    query {
      shop {
        productVendors(first: 250) {
          edges {
            node
          }
        }
      }
    }
  `;

  try {
    const data = await executeQuery(query);

    if (!data?.shop?.productVendors?.edges) {
      return [];
    }

    const vendors = data.shop.productVendors.edges.map(edge => edge.node).sort();
    return vendors;

  } catch (error) {
    console.error('[Shopify API] Error fetching all vendors:', error);
    throw error;
  }
}

export default {
  getCollections,
  getRecentProducts,
  getProductsByCollection,
  getShopifyStats,
  getShopifyActivity,
  searchVendors,
  getProductsByVendor,
  getPaginatedProductsByVendor,
  getProductById,
  getAllProductIds,
  getAllShopifyVendors
};
