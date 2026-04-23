import 'dotenv/config';
import fetch from 'node-fetch';

const shopName = process.env.SHOPIFY_SHOP_NAME;
const accessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
const SHOPIFY_API_URL = `https://${shopName}.myshopify.com/admin/api/2026-04/graphql.json`;

async function getAllVendors() {
  console.log('🔍 Fetching all vendors from Shopify...\n');

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
      const response = await fetch(SHOPIFY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query,
          variables: { cursor }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.errors) {
        console.error('❌ GraphQL Errors:', data.errors);
        throw new Error(data.errors.map(e => e.message).join(', '));
      }

      const products = data.data.shop.products;
      const pageProducts = products.edges.length;
      totalProducts += pageProducts;

      // Add vendors from this page
      products.edges.forEach(edge => {
        if (edge.node.vendor) {
          allVendors.add(edge.node.vendor);
        }
      });

      console.log(`📄 Page ${page}: Found ${pageProducts} products (${allVendors.size} unique vendors so far)`);

      // Update pagination info
      hasNextPage = products.pageInfo.hasNextPage;
      cursor = products.pageInfo.endCursor;
      page++;

      // Add a small delay to avoid rate limits
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  }

  const vendorList = Array.from(allVendors).sort();

  console.log('\n✨ Final Results:');
  console.log('================');
  console.log(`Total Products: ${totalProducts}`);
  console.log(`Total Vendors: ${vendorList.length}\n`);

  console.log('📋 All Vendors:');
  console.log('=============');
  vendorList.forEach((vendor, i) => {
    console.log(`${(i + 1).toString().padStart(3, ' ')}. ${vendor}`);
  });

  return vendorList;
}

// Run if called directly
if (process.argv[1].endsWith('get-all-vendors.js')) {
  getAllVendors();
}
