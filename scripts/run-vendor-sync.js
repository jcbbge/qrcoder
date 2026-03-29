import 'dotenv/config';
import { getAllShopifyVendors } from './lib/shopify-script-client.js';
import { spawn } from 'child_process';
import path from 'path';

// Configuration
const SYNC_SCRIPT = 'scripts/sync-vendor-pages.js';

async function runVendorSync() {
    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;

    try {
        // Get all vendors
        console.log('🔄 Starting vendor sync process...');
        console.log('🔍 Fetching vendors from Shopify...');
        const vendors = await getAllShopifyVendors();

        if (!vendors || vendors.length === 0) {
            throw new Error('No vendors found in Shopify');
        }

        console.log(`✅ Found ${vendors.length} vendors to process\n`);
        console.log('='.repeat(50));
        console.log('Starting sync process...\n');

        // Process each vendor
        for (let i = 0; i < vendors.length; i++) {
            const vendor = vendors[i];
            process.stdout.write(`[${i + 1}/${vendors.length}] ${vendor}: `); // No newline

            try {
                // Run the sync script for this vendor
                let output = '';
                await new Promise((resolve, reject) => {
                    const syncProcess = spawn('node', [SYNC_SCRIPT, vendor], {
                        stdio: ['inherit', 'pipe', 'pipe'] // Capture stdout and stderr
                    });

                    // Collect output
                    syncProcess.stdout.on('data', (data) => {
                        output += data.toString();
                    });

                    syncProcess.stderr.on('data', (data) => {
                        output += data.toString();
                    });

                    syncProcess.on('close', (code) => {
                        if (code === 0) {
                            // Parse the output for the summary line
                            const lines = output.split('\n');
                            const summaryLine = lines.find(line => line.includes(`- ${vendor}:`));

                            if (summaryLine) {
                                console.log(summaryLine.trim());
                            } else {
                                console.log('✅ OK (No changes required)');
                            }

                            successCount++;
                            resolve();
                        } else {
                            console.log(`❌ FAILED (Exit code: ${code})`);
                            failureCount++;
                            reject(new Error(`Sync failed with code ${code}`));
                        }
                    });

                    syncProcess.on('error', (err) => {
                        console.log(`❌ FAILED (${err.message})`);
                        failureCount++;
                        reject(err);
                    });
                });

            } catch (error) {
                // Error already logged in the process handler
                // Continue with next vendor
            }
        }

    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        process.exit(1);
    } finally {
        // Print summary
        const endTime = Date.now();
        const totalDuration = (endTime - startTime) / 1000; // Convert to seconds
        const minutes = Math.floor(totalDuration / 60);
        const seconds = Math.floor(totalDuration % 60);

        console.log('\n' + '='.repeat(50));
        console.log('📊 Sync Summary');
        console.log('='.repeat(50));
        console.log(`Total Vendors Processed: ${vendors.length}`);
        console.log(`Successfully Synced: ${successCount}`);
        console.log(`Failed Syncs: ${failureCount}`);
        console.log(`Total Run Time: ${minutes}m ${seconds}s (${totalDuration.toFixed(1)} seconds)`);
        console.log('='.repeat(50));
    }
}

// Run if called directly
if (process.argv[1].endsWith('run-vendor-sync.js')) {
    runVendorSync()
        .catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}
