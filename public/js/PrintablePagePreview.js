/**
 * PrintablePagePreview Component
 * Renders a standard US Letter page with product cards and QR codes
 */
import { SimpleProductCard } from './SimpleProductCard.js';
import { ProductSearch } from './ProductSearch.js';

export class PrintablePagePreview {
  constructor(containerElement) {
    this.container = containerElement;
    this.pageData = null;
    this.productSearch = new ProductSearch();

    // Add event listener for download button
    this.container.addEventListener('click', (event) => {
      if (event.target.id === 'download-pdf-btn') {
        this.downloadPdf();
      }
    });

    // Listen for product added event
    document.addEventListener('productAdded', () => {
      this.renderPage(this.pageData);
    });

    // Load required styles
    this.loadStyles();
  }

  /**
   * Load required stylesheets
   */
  loadStyles() {
    // Load grid styles
    if (!document.getElementById('grid-styles-link')) {
      const gridLink = document.createElement('link');
      gridLink.id = 'grid-styles-link';
      gridLink.rel = 'stylesheet';
      gridLink.href = '/js/grid-styles.css';
      document.head.appendChild(gridLink);
    }

    // Load product card styles
    if (!document.getElementById('simple-product-card-styles')) {
      const cardLink = document.createElement('link');
      cardLink.id = 'simple-product-card-styles';
      cardLink.rel = 'stylesheet';
      cardLink.href = '/js/SimpleProductCard.css';
      document.head.appendChild(cardLink);
    }

    // Add control button styles
    const controlStyles = document.createElement('style');
    controlStyles.innerHTML = `
      /* Control buttons */
      .page-controls {
        margin-top: 0.5in;
        display: flex;
        justify-content: center;
        gap: 0.5in;
      }

      .page-controls button {
        padding: 10px 15px;
        background-color: #2ecc71;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 16px;
        transition: all 0.3s ease;
      }

      .page-controls button:hover {
        background-color: #27ae60;
      }

      @media print {
        .page-controls {
          display: none !important;
        }
      }
    `;

    if (!document.getElementById('preview-control-styles')) {
      controlStyles.id = 'preview-control-styles';
      document.head.appendChild(controlStyles);
    }
  }

  /**
   * Render a page with product cards
   * @param {Object} pageData - The page data to render
   */
  async renderPage(pageData) {
    console.log('Rendering page with ID:', pageData.id);

    this.pageData = pageData;
    this.container.innerHTML = ''; // Clear previous content

    // Check if products array exists and has items
    const products = pageData.products || [];
    if (!products || products.length === 0) {
      console.log('No products found in page data');
      this.container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No products found for this page</div>';
      return;
    }

    console.log(`Rendering ${products.length} products on page`);

    // Create the page container (8.5" x 11")
    const page = document.createElement('div');
    page.className = 'printable-page';
    page.dataset.pageId = pageData.id || '';
    console.log('🔥 CREATED PAGE:', page);

    // Create the grid container (2x5 grid)
    const grid = document.createElement('div');
    grid.style.width = '8.5in';
    grid.style.height = '11in';
    grid.style.padding = '0.5in';
    grid.style.boxSizing = 'border-box';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    grid.style.gridTemplateRows = 'repeat(5, 1fr)';
    grid.style.gap = '0.1in';
    console.log('🔥 CREATED GRID:', grid);

    // Create 10 cell containers
    for (let i = 0; i < 10; i++) {
      // Create empty cell container with OBVIOUS STYLING
      const container = document.createElement('div');
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.position = 'relative';
      container.style.border = '2px dashed yellow'; // DEBUG BORDER
      container.style.backgroundColor = 'rgba(255,0,0,0.1)'; // DEBUG BG
      console.log(`🔥 CREATED CONTAINER ${i}:`, container);

      // If product exists for this cell, render it
      if (i < products.length) {
        const product = products[i];
        console.log(`🔥 RENDERING PRODUCT ${i}:`, product);

        try {
          const productCard = new SimpleProductCard(product);
          await productCard.attachTo(container);
        } catch (error) {
          console.error(`❌ ERROR RENDERING PRODUCT ${i}:`, error);
          container.innerHTML = `<div style="padding: 10px; color: red;">Error rendering product card</div>`;
        }
      } else {
        console.log(`🔥 CREATING EMPTY CELL ${i}`);
        // Add + button with OBVIOUS STYLING
        const addButton = document.createElement('button');
        addButton.className = 'add-product';
        addButton.textContent = '+';
        addButton.dataset.position = i;
        addButton.style.position = 'absolute';
        addButton.style.top = '50%';
        addButton.style.left = '50%';
        addButton.style.transform = 'translate(-50%, -50%)';
        addButton.style.width = '40px';
        addButton.style.height = '40px';
        addButton.style.backgroundColor = '#ff4444';
        addButton.style.border = '3px solid yellow';
        addButton.style.borderRadius = '4px';
        addButton.style.color = 'white';
        addButton.style.fontSize = '24px';
        addButton.style.cursor = 'pointer';
        addButton.style.zIndex = '1000';
        console.log(`🔥 CREATED ADD BUTTON ${i}:`, addButton);

        addButton.onclick = (e) => {
          console.log('🔥 Add product clicked:', {
            position: i,
            pageId: pageData.id,
            event: e,
            button: e.target,
            container: container,
            grid: grid,
            page: page
          });

          this.productSearch.showModal(
            pageData.id,
            i,
            e.target.getBoundingClientRect()
          );
        };

        container.appendChild(addButton);
      }

      grid.appendChild(container);
    }

    // Assemble page with OBVIOUS STYLING
    page.appendChild(grid);
    console.log('🔥 FINAL PAGE STRUCTURE:', page);
    this.container.appendChild(page);

    // Add control buttons
    const controls = document.createElement('div');
    controls.className = 'page-controls';
    controls.innerHTML = `
      <button id="download-pdf-btn">Download PDF</button>
    `;
    this.container.appendChild(controls);
  }

  /**
   * Download PDF of the current page
   */
  async downloadPdf() {
    try {
      // Get the content area
      const page = this.container.querySelector('.printable-page');
      if (!page) {
        throw new Error('Page content not found');
      }

      console.log('Starting PDF generation...');

      // Load html2canvas from CDN if needed
      if (typeof html2canvas !== 'function') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // Clone the page to avoid modifying the original
      const pageClone = page.cloneNode(true);
      document.body.appendChild(pageClone);

      // *** HIDE REMOVE BUTTONS ON CLONE ***
      const removeButtons = pageClone.querySelectorAll('.remove-card');
      console.log(`[PDF Gen] Found ${removeButtons.length} remove buttons on clone to hide.`);
      removeButtons.forEach(btn => {
        btn.style.display = 'none';
        btn.style.visibility = 'hidden'; // Belt and suspenders
      });
      // *** END HIDE ***

      // Apply additional print-specific styles to the clone
      pageClone.style.transform = 'none';
      pageClone.style.zoom = '100%';
      pageClone.style.scale = '1';
      pageClone.style.position = 'fixed';
      pageClone.style.top = '0';
      pageClone.style.left = '0';
      pageClone.style.margin = '0';
      pageClone.style.padding = '1.18in';
      pageClone.style.width = '8.5in';
      pageClone.style.height = '11in';
      pageClone.style.backgroundColor = 'white';

      // Capture the page with improved settings
      const canvas = await html2canvas(pageClone, {
        scale: 4, // Higher resolution
        useCORS: true,
        backgroundColor: 'white',
        logging: false,
        allowTaint: false,
        removeContainer: true,
        imageTimeout: 0,
        width: 816, // 8.5in * 96dpi
        height: 1056, // 11in * 96dpi
        windowWidth: 816,
        windowHeight: 1056,
        onclone: (clonedDoc) => {
          const clonedPage = clonedDoc.querySelector('.printable-page');
          if (clonedPage) {
            clonedPage.style.transform = 'none';
            clonedPage.style.zoom = '100%';
            clonedPage.style.scale = '1';
            clonedPage.style.position = 'fixed';
            clonedPage.style.top = '0';
            clonedPage.style.left = '0';
          }
        }
      });

      // Clean up the clone
      document.body.removeChild(pageClone);

      // Create PDF with precise dimensions
      const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'in',
        format: 'letter',
        compress: true,
        precision: 16,
        putOnlyUsedFonts: true,
        hotfixes: ['px_scaling']
      });

      // Calculate dimensions to maintain aspect ratio
      const imgWidth = 8.5; // inches
      const imgHeight = 11; // inches

      // Add the image to PDF with exact positioning
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight, '', 'FAST');

      // Save the PDF
      pdf.save('product-cards.pdf');

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF: ' + error.message);
    }
  }
}
