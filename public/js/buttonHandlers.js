/**
 * Button Handlers
 * Handles button click events
 */
import { downloadPDF, downloadMultiPagePDF } from './pdfService.js';

export function initButtonHandlers() {
  // Add all products button
  const addAllBtn = document.getElementById('add-all-header-btn');
  if (addAllBtn) {
    addAllBtn.addEventListener('click', addAllProductsToPage);
  }
  
  // Single page download button
  const downloadPageBtn = document.getElementById('download-page-btn');
  if (downloadPageBtn) {
    downloadPageBtn.addEventListener('click', downloadCurrentPage);
  }
  
  // Multiple pages download button
  const downloadSelectedBtn = document.getElementById('download-selected-btn');
  if (downloadSelectedBtn) {
    downloadSelectedBtn.addEventListener('click', downloadSelectedPages);
  }
}

function addAllProductsToPage() {
  const pageDesigner = window.pageDesigner;
  if (!pageDesigner) return;
  
  // Get all product items from the list
  const productItems = document.querySelectorAll('.selection-product-item');
  if (productItems.length === 0) return;
  
  // Convert the DOM elements to product objects
  const products = Array.from(productItems).map(item => ({
    id: item.dataset.id,
    title: item.querySelector('.selection-product-title').textContent,
    vendor: item.querySelector('.selection-product-vendor').textContent,
    price: item.querySelector('.selection-product-price').textContent
  }));
  
  // Add all products to the page designer
  const addedCount = pageDesigner.addAll(products);
  console.log(`Added ${addedCount} products to page designer`);
  
  // Update position info for each product
  updateProductPositions(products, pageDesigner);
}

function updateProductPositions(products, pageDesigner) {
  const designerProducts = pageDesigner.getProducts();
  
  // For each product, find its position in the page designer
  products.forEach(product => {
    const productItem = document.querySelector(`.selection-product-item[data-id="${product.id}"]`);
    if (!productItem) return;
    
    // Find the product's index in the page designer
    const index = designerProducts.findIndex(p => p && p.id === product.id);
    if (index === -1) return;
    
    // Calculate the position ID (A1, B1, etc.)
    const column = index % 2 === 0 ? 'A' : 'B';
    const row = Math.floor(index / 2) + 1;
    const positionId = `${column}${row}`;
    
    // Update the position display in the UI
    const pageInfo = productItem.querySelector('.selection-product-page');
    if (pageInfo) {
      pageInfo.textContent = `P:1 POS:${positionId}`;
      pageInfo.style.backgroundColor = '#e1f5fe';
      pageInfo.style.color = '#0277bd';
    }
  });
}

/**
 * Download the current page as PDF
 */
async function downloadCurrentPage() {
  try {
    // Check for page preview first (new component)
    const pagePreview = window.pagePreview;
    if (pagePreview && pagePreview.pageData) {
      // Use the PrintablePagePreview component's built-in download method
      await pagePreview.downloadPdf();
      console.log('Current page downloaded successfully using PrintablePagePreview');
      return;
    }
    
    // Fall back to page designer if preview not available
    const pageDesigner = window.pageDesigner;
    if (!pageDesigner) {
      console.error('No page component available');
      alert('No page data available to download');
      return;
    }
    
    // Get products from page designer
    const products = pageDesigner.getProducts().filter(Boolean);
    if (products.length === 0) {
      alert('No products on the current page to download');
      return;
    }
    
    // Download PDF with products
    await downloadPDF(products);
    
    console.log('Current page downloaded successfully using pdfService');
  } catch (error) {
    console.error('Error downloading current page:', error);
    alert('Error generating PDF. Please try again.');
  }
}

/**
 * Download selected pages as a multi-page PDF
 */
async function downloadSelectedPages() {
  try {
    // Get selected pages from the UI
    const selectedPageElements = document.querySelectorAll('.page-block.selected');
    if (selectedPageElements.length === 0) {
      alert('No pages selected. Please select at least one page.');
      return;
    }
    
    // Show loading indicator
    console.log(`Loading ${selectedPageElements.length} selected pages...`);
    
    // Convert selected page elements to page data objects
    const pages = [];
    for (const pageElement of selectedPageElements) {
      const pageId = pageElement.dataset.pageId;
      if (!pageId) continue;
      
      try {
        // Fetch page data from server
        const response = await fetch(`/api/pages/${pageId}`);
        if (!response.ok) {
          console.error(`Error fetching page ${pageId}:`, response.statusText);
          continue;
        }
        
        const pageData = await response.json();
        if (pageData.success && pageData.page) {
          pages.push({
            id: pageData.page.id,
            products: pageData.page.products || []
          });
        }
      } catch (err) {
        console.error(`Error fetching page ${pageId}:`, err);
      }
    }
    
    if (pages.length === 0) {
      alert('No valid pages found. Please try again.');
      return;
    }
    
    console.log(`Generating PDF with ${pages.length} pages...`);
    
    // Download multi-page PDF
    await downloadMultiPagePDF(pages);
    
    console.log(`Downloaded ${pages.length} pages successfully`);
  } catch (error) {
    console.error('Error downloading selected pages:', error);
    alert('Error generating PDF. Please try again.');
  }
}