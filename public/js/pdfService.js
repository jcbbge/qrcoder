/**
 * PDF Service for generating and downloading product cards
 * Uses PrintablePagePreview component for rendering and processing
 */
import { PrintablePagePreview } from './PrintablePagePreview.js';

// Constants
const CARDS_PER_PAGE = 10;
const SHOPIFY_STORE_URL = 'https://harding-art-show.myshopify.com';

/**
 * Generate a PDF document with product cards
 * @param {Array} products - Array of product objects
 * @returns {Promise<Object>} PDF document object
 */
async function generatePDF(products) {
  console.log('[pdfService] Starting PDF generation');
  
  if (!Array.isArray(products) || products.length === 0) {
    console.error('[pdfService] Invalid products array');
    throw new Error('Products array is required');
  }
  
  try {
    // Create temporary container for the preview
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.height = '11in';
    container.style.width = '8.5in';
    document.body.appendChild(container);
    
    // Create preview component
    const preview = new PrintablePagePreview(container);
    
    // Split products into pages (10 products per page)
    const pages = [];
    for (let i = 0; i < products.length; i += CARDS_PER_PAGE) {
      pages.push({
        id: `page-${Math.floor(i / CARDS_PER_PAGE) + 1}`,
        products: products.slice(i, i + CARDS_PER_PAGE)
      });
    }
    
    // Load jsPDF if needed
    if (!window.jspdf) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    
    // Get jsPDF constructor
    const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
    
    // Create PDF document
    const pdf = new jsPDF({
      unit: 'in',
      format: 'letter'
    });
    
    // Process each page
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const pageData = pages[pageIndex];
      
      // Render the page
      await preview.renderPage(pageData);
      
      // Add a new page to PDF (except for first page)
      if (pageIndex > 0) {
        pdf.addPage();
      }
      
      // Get the page element
      const pageElement = container.querySelector('.printable-page');
      
      // Remove any dashed borders from card grid (debugging element)
      const cardGrid = pageElement.querySelector('.card-grid');
      if (cardGrid) {
        cardGrid.style.border = 'none';
      }
      
      // Load html2canvas if needed
      if (typeof html2canvas !== 'function') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      
      // Hide remove buttons before capture
      const removeButtons = pageElement.querySelectorAll('.remove-card');
      removeButtons.forEach(btn => {
        btn.style.display = 'none';
        btn.style.visibility = 'hidden';
      });
      
      // Capture the page with html2canvas
      const canvas = await html2canvas(pageElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: 'white'
      });
      
      // Add the image to PDF
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, 8.5, 11);
    }
    
    // Clean up
    document.body.removeChild(container);
    
    return pdf;
  } catch (error) {
    console.error('[pdfService] PDF generation error:', error);
    throw error;
  }
}

/**
 * Download a PDF with product cards
 * @param {Array} products - Array of product objects
 */
async function downloadPDF(products) {
  try {
    const pdf = await generatePDF(products);
    pdf.save('product-cards.pdf');
    console.log('[pdfService] PDF downloaded successfully');
  } catch (error) {
    console.error('[pdfService] PDF download error:', error);
    alert('Error generating PDF. Please try again.');
  }
}

/**
 * Download multiple pages as a single PDF
 * @param {Array} pages - Array of page objects, each with products array
 */
async function downloadMultiPagePDF(pages) {
  try {
    if (!Array.isArray(pages) || pages.length === 0) {
      throw new Error('Valid pages array required');
    }
    
    // Create temporary container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);
    
    // Create preview component
    const preview = new PrintablePagePreview(container);
    
    // Load jsPDF if needed
    if (!window.jspdf) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    
    // Get jsPDF constructor
    const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
    
    // Create PDF document
    const pdf = new jsPDF({
      unit: 'in',
      format: 'letter'
    });
    
    // Process each page
    for (let i = 0; i < pages.length; i++) {
      // Render the page
      await preview.renderPage(pages[i]);
      
      // Add a new page to PDF (except for first page)
      if (i > 0) {
        pdf.addPage();
      }
      
      // Get the page element
      const pageElement = container.querySelector('.printable-page');
      
      // Remove any dashed borders from card grid (debugging element)
      const cardGrid = pageElement.querySelector('.card-grid');
      if (cardGrid) {
        cardGrid.style.border = 'none';
      }
      
      // Load html2canvas if needed
      if (typeof html2canvas !== 'function') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      
      // Hide remove buttons before capture
      const removeButtons = pageElement.querySelectorAll('.remove-card');
      removeButtons.forEach(btn => {
        btn.style.display = 'none';
        btn.style.visibility = 'hidden';
      });
      
      // Capture the page with html2canvas
      const canvas = await html2canvas(pageElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: 'white'
      });
      
      // Add the image to PDF
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, 8.5, 11);
    }
    
    // Clean up
    document.body.removeChild(container);
    
    // Download the PDF
    pdf.save('product-pages.pdf');
    console.log('[pdfService] Multi-page PDF downloaded successfully');
  } catch (error) {
    console.error('[pdfService] Multi-page PDF error:', error);
    alert('Error generating multi-page PDF. Please try again.');
  }
}

// Make functions available globally
window.generatePDF = generatePDF;
window.downloadPDF = downloadPDF;
window.downloadMultiPagePDF = downloadMultiPagePDF;

// Export for ES modules
export { generatePDF, downloadPDF, downloadMultiPagePDF };
