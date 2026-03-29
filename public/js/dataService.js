/**
 * Data Service
 * Handles data loading and API communication
 */

// Cache for data to avoid redundant API calls
let productCardsCache = null;
let statsCache = null;

export async function loadInitialData() {
  try {
    const productCards = await getProductCards();
    
    // Note: We no longer update dashboard stats here to avoid conflicts
    // Dashboard stats are now directly updated by the loadDashboardStats function
    
    return productCards;
  } catch (error) {
    console.error('Error loading initial data:', error);
    return [];
  }
}

export async function getProductCards() {
  // Return cached data if available
  if (productCardsCache) return productCardsCache;

  try {
    const response = await fetch('/api/product-cards');
    if (!response.ok) throw new Error('Failed to load products');

    productCardsCache = await response.json();
    return productCardsCache;
  } catch (error) {
    console.error('Error fetching product cards:', error);
    return [];
  }
}

export async function getStats() {
  // Return cached data if available and less than 5 minutes old
  const now = Date.now();
  if (statsCache && (now - statsCache.timestamp < 300000)) {
    return statsCache.data;
  }

  try {
    const response = await fetch('/api/stats');
    if (!response.ok) throw new Error('Failed to load stats');
    
    const stats = await response.json();
    
    // Cache the stats with timestamp
    statsCache = {
      data: stats,
      timestamp: now
    };
    
    return stats;
  } catch (error) {
    console.error('Error fetching stats:', error);
    return {
      productCards: { total: 0, unassigned: 0, assigned: 0 },
      pages: { total: 0, ready: 0, downloaded: 0 },
      shopify: {}
    };
  }
}

export function clearCache() {
  productCardsCache = null;
  statsCache = null;
}
