import 'dotenv/config';
import { getAllShopifyVendors } from './lib/shopify-script-client.js';

async function displayVendors() {
    try {
        console.log('🔍 Fetching all vendors from Shopify...');
        const vendors = await getAllShopifyVendors();

        if (!vendors || vendors.length === 0) {
            console.error('❌ No vendors found in Shopify');
            process.exit(1);
        }

        console.log('\n✅ Found', vendors.length, 'vendors:\n');

        // Display as numbered list and comma-separated
        vendors.forEach((vendor, i) => {
            console.log(`${i + 1}. ${vendor}`);
        });

        console.log('\n📋 Comma-separated list:\n');
        console.log(vendors.join(', '));

        return vendors;
    } catch (error) {
        console.error('❌ Error fetching vendors:', error.message);
        throw error;
    }
}

// Run if called directly
if (process.argv[1].endsWith('get-shopify-vendors.js')) {
    displayVendors()
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}
