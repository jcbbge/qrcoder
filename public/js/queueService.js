/**
 * Queue Service
 * Handles queue creation and management
 */

export async function createQueue(pageObject) {
  try {
    const response = await fetch('/api/queues', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `Queue ${new Date().toLocaleTimeString()}`,
        products: pageObject.productIds,
        positions: pageObject.positions,
        status: 'pending'
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to create queue');
    }
    
    const result = await response.json();
    console.log('Queue created:', result);
    
    // Clear the page designer
    if (window.pageDesigner) {
      window.pageDesigner.clear();
    }
    
    return result;
  } catch (error) {
    console.error('Error creating queue:', error);
    throw error;
  }
}