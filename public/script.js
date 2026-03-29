/**
 * Main application entry point
 * Imports modules and initializes the application
 */

import { initVendorSearch } from './js/vendorSearchController.js';
import { initButtonHandlers } from './js/buttonHandlers.js';
import { loadInitialData } from './js/dataService.js';
import { getAllPages, downloadPages } from './js/pagesService.js';

// Track selected pages for batch operations
const selectedPages = new Set();

/**
 * Initialize the Pages Visualizer component
 */
async function initPagesVisualizer() {
  const pagesGrid = document.getElementById('pages-visualizer-grid');
  const downloadSelectedBtn = document.getElementById('download-selected-btn');

  // Load pages from API
  try {
    pagesGrid.innerHTML = '<div class="loading">Loading pages...</div>';

    const pages = await getAllPages();

    if (!pages || pages.length === 0) {
      console.log('No pages found');
      pagesGrid.innerHTML = `
        <div class="no-data">
          <p>No pages available</p>
          <button id="create-new-page-btn" class="action-button">Create New Page</button>
        </div>
      `;

      // Add click handler for the button
      document.getElementById('create-new-page-btn')?.addEventListener('click', async () => {
        try {
          // Create a new empty page
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

          // Reload the page visualizer
          await initPagesVisualizer();
        } catch (error) {
          console.error('Error creating new page:', error);
        }
      });

      return;
    }

    // Clear loading message
    pagesGrid.innerHTML = '';

    // Sort pages by ID in ascending order
    const sortedPages = [...pages].sort((a, b) => a.id - b.id);

    // Render each page as a block
    sortedPages.forEach(page => {
      // Parse card_ids if it's a string
      const cardIds = typeof page.card_ids === 'string'
        ? JSON.parse(page.card_ids || '[]')
        : (page.card_ids || []);

      const pageBlock = document.createElement('div');
      pageBlock.className = 'page-block';
      pageBlock.dataset.pageId = page.id;
      pageBlock.dataset.cardIds = JSON.stringify(cardIds);

      if (page.downloaded_at) {
        pageBlock.classList.add('downloaded');
      }

      // Create page content
      pageBlock.innerHTML = `
        <input type="checkbox" class="page-block-checkbox" data-page-id="${page.id}">
        <div class="page-block-id">${page.id}</div>
        <div class="page-block-count">${cardIds.length} cards</div>
        <div class="page-view-icon" data-page-id="${page.id}">🔍</div>
      `;

      // Add click handler for page selection
      pageBlock.addEventListener('click', (e) => {
        // Don't trigger if checkbox or view icon was clicked
        if (e.target.type === 'checkbox' ||
            e.target.classList.contains('page-view-icon') ||
            e.target.closest('.page-view-icon')) {
          return;
        }

        // Default page block behavior (selection)
        const checkbox = pageBlock.querySelector('.page-block-checkbox');
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      });

      // Add click handler for view icon
      const viewIcon = pageBlock.querySelector('.page-view-icon');
      if (viewIcon) {
        viewIcon.addEventListener('click', function(e) {
          e.stopPropagation(); // Prevent triggering the parent click
          e.preventDefault();
          console.log('View icon clicked for page:', page.id);

          // Load this page into the Page Designer
          loadPageIntoDesigner(page);

          // Return false to ensure the event doesn't bubble up
          return false;
        });
      }

      // Add checkbox change handler
      const checkbox = pageBlock.querySelector('.page-block-checkbox');
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation(); // Prevent triggering the parent click

        if (checkbox.checked) {
          pageBlock.classList.add('selected');
          selectedPages.add(page.id);
        } else {
          pageBlock.classList.remove('selected');
          selectedPages.delete(page.id);
        }

        // Update download button state
        downloadSelectedBtn.disabled = selectedPages.size === 0;
      });

      pagesGrid.appendChild(pageBlock);
    });

    // Add download button handler
    downloadSelectedBtn.addEventListener('click', async () => {
      try {
        const pageIds = Array.from(selectedPages);
        await downloadPages(pageIds);

        // Refresh the pages visualizer
        await initPagesVisualizer();
      } catch (error) {
        console.error('Error downloading pages:', error);
      }
    });

  } catch (error) {
    console.error('Error loading pages:', error);
    pagesGrid.innerHTML = `<div class="error">Failed to load pages: ${error.message}</div>`;
  }
}

/**
 * Load a page into the PrintablePagePreview for editing
 */
async function loadPageIntoDesigner(page) {
  try {
    console.log('Loading page into preview:', page);

    // Get or create the PrintablePagePreview instance
    let previewComponent = window.pagePreview;

    if (!previewComponent) {
      // Initialize the PrintablePagePreview
      const previewContainer = document.getElementById('page-preview-container');
      if (!previewContainer) {
        console.error('Preview container not found');
        return;
      }

      // Import the PrintablePagePreview component
      const { PrintablePagePreview } = await import('./js/PrintablePagePreview.js');
      previewComponent = new PrintablePagePreview(previewContainer);

      // Store for future use
      window.pagePreview = previewComponent;
    }

    // Render the page
    await previewComponent.renderPage(page);
    console.log('Page loaded into preview successfully');

    // Update the current page ID display
    const currentPageIdElement = document.getElementById('current-page-id');
    if (currentPageIdElement) {
      currentPageIdElement.textContent = `Page ${page.id}`;
    }

  } catch (error) {
    console.error('Error loading page into designer:', error);
  }
}

/**
 * Load dashboard statistics
 */
async function loadDashboardStats() {
  try {
    const response = await fetch('/api/stats');
    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.status}`);
    }

    const stats = await response.json();

    // Update product cards stats
    document.getElementById('product-cards-total').textContent = stats.productCards.total;
    document.getElementById('product-cards-unassigned').textContent = stats.productCards.unassigned;
    document.getElementById('product-cards-assigned').textContent = stats.productCards.assigned;

    // Update pages stats
    document.getElementById('pages-total').textContent = stats.pages.total;
    document.getElementById('pages-ready').textContent = stats.pages.ready;
    document.getElementById('pages-downloaded').textContent = stats.pages.downloaded;

    // Update Pages Overview stats
    document.getElementById('available-pages-total').textContent = stats.pages.total;
    document.getElementById('available-pages-ready').textContent = stats.pages.ready;
    document.getElementById('available-pages-downloaded').textContent = stats.pages.downloaded;

    // Update legacy elements
    const legacyElements = {
      'unprocessed-count': stats.productCards.unassigned,
      'assigned-count': stats.productCards.assigned,
      'ready-pages': stats.pages.ready,
      'printed-pages': stats.pages.downloaded
    };

    Object.entries(legacyElements).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM fully loaded and parsed');

  // Initialize core functionalities
  // await initPageDesigner(); // Removed
  await initVendorSearch();
  await loadInitialData();
  await initPagesVisualizer(); // Add this line
  initButtonHandlers();
});
