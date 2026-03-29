/**
 * Test script for queue creation
 * Tests the fixed queues.createQueue method
 */

import 'dotenv/config';
import * as db from '../src/db.js';

async function testQueueCreation() {
  console.log('🧪 TEST: Testing queue creation with page_ids');
  
  try {
    // Create a test queue with page_ids
    const queueData = {
      name: 'test_queue_' + Date.now(),
      status: 'pending',
      page_ids: JSON.stringify([1, 2, 3, 4, 5]),
      custom_data: JSON.stringify({ test: true, vendorName: 'Test Vendor' }),
      metrics: JSON.stringify({ totalPages: 5, totalCards: 50 })
    };
    
    console.log('🧪 TEST: Creating queue with data:', queueData);
    
    // Use the queues interface
    const newQueue = await db.queues.createQueue(queueData);
    console.log('🧪 TEST: Created queue result:', newQueue);
    
    // Verify the result
    if (newQueue && newQueue.page_ids === queueData.page_ids) {
      console.log('✅ TEST: Queue created successfully with page_ids!');
    } else {
      console.log('❌ TEST: Queue creation failed or page_ids not set correctly');
      console.log('Expected:', queueData.page_ids);
      console.log('Got:', newQueue ? newQueue.page_ids : 'null');
    }
    
    // Fetch all queues to verify
    const allQueues = await db.queues.getAllQueues();
    console.log(`🧪 TEST: Found ${allQueues.length} queues in database`);
    
    // Find our test queue
    const testQueue = allQueues.find(q => q.name === queueData.name);
    if (testQueue) {
      console.log('✅ TEST: Found test queue in database with ID:', testQueue.id);
      console.log('Queue data:', {
        name: testQueue.name,
        page_ids: testQueue.page_ids,
        custom_data: testQueue.custom_data
      });
    }
    
    return { success: true, queue: newQueue };
  } catch (error) {
    console.error('❌ TEST ERROR:', error);
    return { success: false, error };
  }
}

// Run the test
testQueueCreation()
  .then(result => {
    console.log('🧪 TEST COMPLETE - Result:', result.success ? 'SUCCESS' : 'FAILURE');
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ TEST FAILED:', error);
    process.exit(1);
  });