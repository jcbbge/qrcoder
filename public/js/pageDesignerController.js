/**
 * Page Designer Controller
 * Manages the page designer component
 */

import { createQueue } from './queueService.js';
import { getAllPages } from './pagesService.js';

let pageDesigner;

export async function initPageDesigner() {
  const pageDesignerContainer = document.getElementById('page-designer-container');
  if (!pageDesignerContainer) {
    console.error('Page designer container not found');
    return;
  }

  // Set loading state
  pageDesignerContainer.innerHTML = '<div style="padding: 20px; text-align: center;">Loading...</div>';

  try {
    // Ensure QRCodeComponent is available
    if (!window.qrCodeComponent) {
      throw new Error('QRCodeComponent not loaded');
    }

    // Clear loading message before initializing
    pageDesignerContainer.innerHTML = '';

    // Create the page designer instance
    pageDesigner = new PageDesigner({
      container: pageDesignerContainer,
      onPageFull: () => {
        console.log('Page is full');
      },
      onAddToQueue: (products) => {
        console.log('Adding to queue:', products);
        createQueue(products);
      }
    });

    // Make it globally available for other components
    window.pageDesigner = pageDesigner;

    // Try to load an existing page or create a new one
    try {
      const pages = await getAllPages();
      if (pages && pages.length > 0) {
        // Find the first non-downloaded page
        const availablePage = pages.find(p => !p.downloaded_at);
        if (availablePage) {
          await loadPageIntoDesigner(availablePage);
        } else {
          // All pages are downloaded, create a new one
          await createNewPage();
        }
      } else {
        // No pages exist, create a new one
        await createNewPage();
      }
    } catch (error) {
      console.error('Error loading initial page:', error);
      // Still show the empty designer even if page loading fails
      const currentPageIdElement = document.getElementById('current-page-id');
      if (currentPageIdElement) {
        currentPageIdElement.textContent = 'New Page';
      }
    }

    // --- Add Button Handlers ---
    const downloadBtn = document.querySelector('.page-designer-download-btn');
    const printBtn = document.querySelector('.page-designer-print-btn');

    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        console.log('Download button clicked. PDF generation will be added here.');
        // TODO: Implement html2pdf logic
        alert('Download functionality not yet implemented.'); // Placeholder feedback
      });
    } else {
      console.warn('Download button (.page-designer-download-btn) not found.');
    }

    if (printBtn) {
      printBtn.addEventListener('click', () => {
        console.log('Print button clicked. Triggering browser print...');
        window.print();
      });
    } else {
      console.warn('Print button (.page-designer-print-btn) not found.');
    }
    // --- End Button Handlers ---

  } catch (error) {
    console.error('Failed to initialize page designer:', error);
    pageDesignerContainer.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #e74c3c;">
        Failed to initialize page designer: ${error.message}
      </div>
    `;
  }
}

async function createNewPage() {
  try {
    const response = await fetch('/api/pages/new', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      throw new Error(`Failed to create page: ${response.status}`);
    }

    const newPage = await response.json();
    await loadPageIntoDesigner(newPage);
  } catch (error) {
    console.error('Error creating new page:', error);
    throw error;
  }
}

async function loadPageIntoDesigner(page) {
  if (!pageDesigner) {
    console.error('Page Designer not initialized');
    return;
  }

  // Update the current page ID display
  const currentPageIdElement = document.getElementById('current-page-id');
  if (currentPageIdElement) {
    currentPageIdElement.textContent = `Page ${page.id}`;
  }

  // Clear current products in the designer
  pageDesigner.clear();

  // Parse card_ids if it's a string
  const cardIds = typeof page.card_ids === 'string'
    ? JSON.parse(page.card_ids || '[]')
    : (page.card_ids || []);

  // Store the current page ID in the page designer
  pageDesigner.currentPageId = page.id;

  // If there are no cards, we're done
  if (cardIds.length === 0) {
    console.log('Page has no cards');
    return;
  }

  // Load card data for each ID
  const loadCardPromises = cardIds.map(async (cardId) => {
    try {
      // First get the card data from our database
      const cardResponse = await fetch(`/api/product-cards/${cardId}`);
      if (!cardResponse.ok) {
        throw new Error(`Failed to load card: ${cardResponse.status}`);
      }
      const cardData = await cardResponse.json();
      console.log('Loaded card data from DB:', cardData);

      // Then get fresh product data from Shopify using vendor endpoint
      const vendorName = cardData.artist_name;
      if (!vendorName) {
        throw new Error(`Card ${cardId} has no vendor name`);
      }

      const shopifyResponse = await fetch(`/api/shopify/products/vendor/${encodeURIComponent(vendorName)}`);
      if (!shopifyResponse.ok) {
        throw new Error(`Failed to load Shopify data: ${shopifyResponse.status}`);
      }
      const vendorProducts = await shopifyResponse.json();
      console.log('Loaded fresh Shopify vendor products:', vendorProducts);

      // Find the matching product from vendor's products
      const shopifyData = vendorProducts.find(p => p.id === cardData.shopify_id);
      if (!shopifyData) {
        console.error(`Could not find matching Shopify product for card ${cardId} in vendor's products`);
        return cardData; // Fall back to card data if no match found
      }

      console.log('Found matching Shopify product:', shopifyData);

      // Merge the data, preferring Shopify's fresh data
      return {
        ...cardData,
        price: shopifyData.price || cardData.price,
        title: shopifyData.title || cardData.product_name,
        vendor: shopifyData.vendor || cardData.artist_name
      };
    } catch (error) {
      console.error(`Error loading data for card ${cardId}:`, error);
      return null;
    }
  });

  // Wait for all cards to load
  const cards = await Promise.all(loadCardPromises);
  const validCards = cards.filter(card => card !== null);

  // Add each card to the page designer
  validCards.forEach(card => {
    try {
      // Extract handle from onlineStoreUrl if not directly available
      let handle = card.handle || card.product_handle;
      if (!handle && card.onlineStoreUrl) {
        const match = card.onlineStoreUrl.match(/\/products\/([^/?#]+)/);
        handle = match ? match[1] : null;
      }

      // Create the product URL slug directly from product_name - THE ONLY WAY
      const productUrlSlug = card.product_name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      console.log(`Created product URL slug from product_name: ${productUrlSlug}`);

      // Ensure card data has the correct structure
      const safeCard = {
        ...card,
        price: parseFloat(card.price) || 0,
        title: card.product_name, // product_name is always available
        artist: card.artist_name, // artist_name is always available
        id: card.shopify_id || card.id,
        // The ONLY correct value for QR code generation
        productUrlPath: productUrlSlug
      };
      console.log('Processing card with normalized data:', safeCard);
      pageDesigner.addProduct(safeCard);
    } catch (error) {
      console.error('Error adding card to designer:', error);
    }
  });
}

export function getPageDesigner() {
  return pageDesigner;
}

export function addProductToPage(product) {
  if (!pageDesigner) return false;
  return pageDesigner.addProduct(product);
}
