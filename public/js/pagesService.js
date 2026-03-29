/**
 * Pages Service
 * Handles pages data loading and API communication
 */

// Cache for pages data
let pagesCache = null;

export async function getAllPages() {
  try {
    console.log('[Pages Service] Fetching all pages...');
    const response = await fetch('/api/pages');

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to load pages: ${errorData.error || response.statusText}`);
    }

    const pages = await response.json();
    console.log('[Pages Service] Fetched pages:', pages.length);

    // Sort pages by creation date (newest first)
    pages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    pagesCache = pages;
    return pages;
  } catch (error) {
    console.error('[Pages Service] Error fetching pages:', error);
    return [];
  }
}

export async function downloadPages(pageIds) {
  try {
    console.log('[Pages Service] Downloading pages:', pageIds);
    const response = await fetch('/api/pages/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pageIds })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to download pages: ${errorData.error || response.statusText}`);
    }

    const result = await response.json();
    console.log('[Pages Service] Download successful:', result);

    // Clear cache to force refresh
    clearCache();

    return result;
  } catch (error) {
    console.error('[Pages Service] Error downloading pages:', error);
    throw error;
  }
}

export async function createNewPage() {
  try {
    console.log('[Pages Service] Creating new page...');
    const response = await fetch('/api/pages/new', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to create page: ${errorData.error || response.statusText}`);
    }

    const page = await response.json();
    console.log('[Pages Service] Created new page:', page);

    // Clear cache to force refresh
    clearCache();

    return page;
  } catch (error) {
    console.error('[Pages Service] Error creating new page:', error);
    throw error;
  }
}

export function clearCache() {
  console.log('[Pages Service] Clearing cache');
  pagesCache = null;
}
