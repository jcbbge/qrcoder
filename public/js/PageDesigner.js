import { ProductCard } from './ProductCard.js';

/**
 * PageDesigner Component
 *
 * Reusable component for creating and managing pages of product cards.
 * Accepts 1-10 product cards and renders them in a 2×5 grid layout.
 * Supports adding/removing cards, previewing, and adding to queue.
 */
export class PageDesigner {
  /**
   * Create a new PageDesigner instance
   * @param {string|Object} options - Either a container ID string or an options object
   * @param {HTMLElement|string} options.container - The container element or its ID
   */
  constructor(options) {
    // Ensure QR code component is available
    if (!window.qrCodeComponent) {
      throw new Error('QRCodeComponent must be loaded before PageDesigner');
    }

    // Handle both string ID and options object
    if (typeof options === 'string') {
      this.container = document.getElementById(options);
    } else if (options && options.container) {
      this.container = typeof options.container === 'string'
        ? document.getElementById(options.container)
        : options.container;
    }

    if (!this.container) {
      throw new Error('PageDesigner container not found');
    }

    this.GRID_ROWS = 5;
    this.GRID_COLS = 2;
    this.TOTAL_SLOTS = this.GRID_ROWS * this.GRID_COLS;

    // Initialize the page designer
    this.init();
  }

  init() {
    // Create perforated page container
    const container = document.createElement('div');
    container.className = 'perforated-page-container';
    this.container.appendChild(container);

    // Create perforated page grid (main page element)
    this.grid = document.createElement('div');
    this.grid.className = 'perforated-page-grid';
    container.appendChild(this.grid);

    // Create grid cells
    this.cells = [];
    for (let i = 0; i < this.TOTAL_SLOTS; i++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.position = i + 1;

      // Add empty state
      const emptySpan = document.createElement('span');
      emptySpan.textContent = 'Empty';
      cell.appendChild(emptySpan);

      this.grid.appendChild(cell);
      this.cells.push(cell);

      // Add drop zone functionality
      this.setupDropZone(cell);
    }

    // Initialize drag and drop
    this.initDragAndDrop();
  }

  setupDropZone(cell) {
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      cell.classList.add('dragover');
    });

    cell.addEventListener('dragleave', () => {
      cell.classList.remove('dragover');
    });

    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('dragover');

      const productData = e.dataTransfer.getData('application/json');
      if (productData) {
        this.addProductToCell(JSON.parse(productData), cell);
      }
    });
  }

  initDragAndDrop() {
    // Make cells droppable
    this.cells.forEach(cell => {
      cell.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (cell.classList.contains('empty')) {
          cell.classList.add('drag-hover');
        }
      });

      cell.addEventListener('dragleave', () => {
        cell.classList.remove('drag-hover');
      });
    });
  }

  async addProductToCell(product, cell) {
    try {
      // Clear existing content
      cell.innerHTML = '';
      cell.classList.add('filled');

      // Create cell content structure
      const content = document.createElement('div');
      content.className = 'grid-cell-content';

      // Add position indicator and remove button
      content.innerHTML = `
        <span class="grid-cell-position">${cell.dataset.position}</span>
        <button class="grid-cell-remove" data-position="${cell.dataset.position}" data-product-id="${product.id}">×</button>
      `;

      // Add remove button handler
      content.querySelector('.grid-cell-remove').onclick = () => this.removeProductFromCell(cell);

      // Create product card using our single source of truth
      const cardContainer = document.createElement('div');
      new ProductCard({
        id: product.id,
        title: product.title,
        vendor: product.artist,
        price: product.price,
        type: product.type, // Add type for queue/page distinction
        url: product.url || `https://hardingacademy.myshopify.com/products/${product.handle || product.id}`
      }).attachTo(cardContainer);

      content.appendChild(cardContainer);
      cell.appendChild(content);

    } catch (error) {
      console.error('[PageDesigner] Error adding product to cell:', error);
      this.removeProductFromCell(cell);
    }
  }

  removeProductFromCell(cell) {
    cell.innerHTML = `
      <div class="grid-cell-placeholder">
        <span class="grid-cell-position">${cell.dataset.position}</span>
      </div>
    `;
    cell.classList.remove('filled');
  }

  getOccupiedCells() {
    return this.cells.filter(cell => cell.classList.contains('filled'));
  }

  clear() {
    this.cells.forEach(cell => this.removeProductFromCell(cell));
  }

  /**
   * Add a product to the first available cell
   * @param {Object} product - The product to add
   * @param {number} [position] - Optional specific position (1-based)
   * @returns {boolean} - Whether the product was added successfully
   */
  addProduct(product, position) {
    try {
      // If position is specified, try to add to that cell
      if (position) {
        const cell = this.cells[position - 1];
        if (cell && !cell.classList.contains('filled')) {
          this.addProductToCell(product, cell);
          return true;
        }
        return false;
      }

      // Find first empty cell
      const emptyCell = this.cells.find(cell => !cell.classList.contains('filled'));
      if (!emptyCell) {
        console.warn('[PageDesigner] No empty cells available');
        return false;
      }

      this.addProductToCell(product, emptyCell);
      return true;
    } catch (error) {
      console.error('[PageDesigner] Error adding product:', error);
      return false;
    }
  }

  handleCellClick(cell) {
    // Implementation depends on your needs
    console.log('Cell clicked:', cell.dataset.position);
  }

  getProducts() {
    const products = [];
    this.container.querySelectorAll('.grid-cell').forEach((cell, index) => {
      if (cell.classList.contains('filled')) {
        const removeBtn = cell.querySelector('.grid-cell-remove');
        if (removeBtn) {
          products[index] = {
            id: removeBtn.dataset.productId,
            position: cell.dataset.position
          };
        }
      }
    });
    return products;
  }
}

// Initialize PageDesigner when the module is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Make PageDesigner available globally for legacy code
  window.PageDesigner = PageDesigner;
});
