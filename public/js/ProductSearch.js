/**
 * ProductSearch Component
 * Handles product search modal and functionality
 */
export class ProductSearch {
  constructor() {
    this.modal = null;
    this.searchTimeout = null;
    this.currentPageId = null;
    this.currentPosition = null;
    this.setupModal();
  }

  setupModal() {
    // Create modal element
    this.modal = document.createElement('div');
    this.modal.className = 'product-search-modal';
    this.modal.style.display = 'none';

    // Create search input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'product-search-input';
    input.placeholder = 'Search by name or ID...';

    // Create results container
    const results = document.createElement('div');
    results.className = 'product-search-results';

    // Add to modal
    this.modal.appendChild(input);
    this.modal.appendChild(results);
    document.body.appendChild(this.modal);

    // Setup event listeners
    input.addEventListener('input', (e) => this.handleSearch(e.target.value));
    document.addEventListener('click', (e) => {
      if (!this.modal.contains(e.target) && e.target.className !== 'add-product') {
        this.hideModal();
      }
    });

    // Handle search input
    input.addEventListener('keyup', (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.handleSearch(e.target.value);
      }, 300);
    });
  }

  async handleSearch(query) {
    const results = this.modal.querySelector('.product-search-results');

    if (!query.trim()) {
      results.innerHTML = '';
      return;
    }

    results.innerHTML = '<div class="product-search-loading">Searching...</div>';

    try {
      const response = await fetch(`/api/product-cards/search?q=${encodeURIComponent(query)}&limit=5`);
      const data = await response.json();

      if (!data.length) {
        results.innerHTML = '<div class="product-search-no-results">No products found</div>';
        return;
      }

      results.innerHTML = data.map(product => `
        <div class="product-search-item" data-id="${product.id}">
          <img src="${product.image_url || '/placeholder.png'}" alt="${product.title}">
          <div class="product-search-item-info">
            <div class="product-search-item-title">${product.title}</div>
            <div class="product-search-item-id">${product.shopify_id}</div>
          </div>
          <div class="product-search-item-price">$${product.price}</div>
        </div>
      `).join('');

      // Add click handlers to results
      results.querySelectorAll('.product-search-item').forEach(item => {
        item.addEventListener('click', () => this.handleProductSelect(item.dataset.id));
      });

    } catch (error) {
      console.error('Search error:', error);
      results.innerHTML = '<div class="product-search-no-results">Error searching products</div>';
    }
  }

  async handleProductSelect(productId) {
    try {
      // Get current page data
      const pageResponse = await fetch(`/api/pages/${this.currentPageId}`);
      const pageData = await pageResponse.json();

      // Parse and update card IDs
      let cardIds = JSON.parse(pageData.card_ids || '[]');
      cardIds.splice(this.currentPosition, 0, productId);

      // Update product card position
      await fetch('/api/product-cards/position', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          card_id: productId,
          page_id: this.currentPageId,
          position: this.currentPosition,
          status: 'processed'
        })
      });

      // Update page card_ids
      await fetch(`/api/pages/${this.currentPageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          card_ids: cardIds
        })
      });

      // Hide modal
      this.hideModal();

      // Trigger page refresh
      const event = new CustomEvent('productAdded', {
        detail: {
          pageId: this.currentPageId,
          productId: productId,
          position: this.currentPosition
        }
      });
      document.dispatchEvent(event);

    } catch (error) {
      console.error('Error adding product:', error);
      alert('Failed to add product. Please try again.');
    }
  }

  showModal(pageId, position, buttonRect) {
    this.currentPageId = pageId;
    this.currentPosition = position;

    // Position modal relative to button
    this.modal.style.top = `${buttonRect.top}px`;
    this.modal.style.left = `${buttonRect.left}px`;
    this.modal.style.display = 'flex';

    // Focus search input
    const input = this.modal.querySelector('.product-search-input');
    input.value = '';
    input.focus();
  }

  hideModal() {
    this.modal.style.display = 'none';
    this.currentPageId = null;
    this.currentPosition = null;
  }
}
