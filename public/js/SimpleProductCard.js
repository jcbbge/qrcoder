/**
 * SimpleProductCard Component
 * A clean, reliable implementation for product cards with QR codes
 * Designed for Harding Academy Art Show
 */
export class SimpleProductCard {
  /**
   * Create a new SimpleProductCard instance
   * @param {Object} product - The product data to display
   */
  constructor(product) {
    if (!product) {
      console.error('SimpleProductCard: No product data provided');
      throw new Error('Product data is required');
    }

    this.product = product;
    this.formattedData = this.formatProductData();
  }

  /**
   * Format product information for display
   * @returns {Object} Formatted product data
   */
  formatProductData() {
    const { id, title, artist, artist_name, vendor, price, shopify_id } = this.product;

    // Extract numeric ID from Shopify ID
    let displayId = shopify_id || id || '';
    if (typeof displayId === 'string' && displayId.includes('gid://shopify/Product/')) {
      displayId = displayId.split('/').pop();
    }

    // Format price
    let formattedPrice = '';
    if (price === undefined || price === null) {
      formattedPrice = '$0';
    } else if (typeof price === 'number') {
      // Format the whole number part with commas
      const wholeNumber = Math.floor(price);
      const hasDecimals = price % 1 !== 0;

      // Format with commas using Intl.NumberFormat
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: hasDecimals ? 2 : 0
      });

      formattedPrice = `$${formatter.format(price)}`;
    } else {
      // If price is a string, try to parse it and format
      const numPrice = parseFloat(price);
      if (!isNaN(numPrice)) {
        const hasDecimals = numPrice % 1 !== 0;

        const formatter = new Intl.NumberFormat('en-US', {
          style: 'decimal',
          minimumFractionDigits: 0,
          maximumFractionDigits: hasDecimals ? 2 : 0
        });

        formattedPrice = `$${formatter.format(numPrice)}`;
      } else {
        formattedPrice = `$${price}`;
      }
    }

    return {
      id: displayId,
      title: title || 'Untitled',
      artist: artist || artist_name || vendor || '',
      price: formattedPrice
    };
  }

  /**
   * Generate QR code for the product
   * @param {string} productUrlPath - Product URL path for QR code generation
   * @returns {Promise<HTMLElement>} QR code container element
   */
  async generateQRCode(product) {
    if (!window.qrCodeComponent) {
      console.error('SimpleProductCard: QRCodeComponent not found globally');
      throw new Error('QRCodeComponent is required but not loaded.');
    }
    if (!product || (!product.handle && !product.onlineStoreUrl)) {
      console.error('SimpleProductCard: Product data missing handle or onlineStoreUrl:', product);
      throw new Error('Product handle or onlineStoreUrl is required for QR code generation.');
    }

    // Create container for QR code with appropriate class
    const qrContainer = document.createElement('div');
    qrContainer.className = 'simple-card-qr-container';

    try {
      // Generate QR code using QRCodeComponent
      // Pass the received product object directly
      // Use formatted title from this.formattedData if available
      await window.qrCodeComponent.createQRElement({
        ...product, // Spread the received product data
        title: this.formattedData.title || product.title // Prefer formatted title
      }, qrContainer);

      return qrContainer;
    } catch (error) {
      console.error('SimpleProductCard: Error generating QR code via QRCodeComponent:', error);

      // Create error placeholder
      const errorElement = document.createElement('div');
      errorElement.className = 'qr-error';
      errorElement.textContent = 'QR Error';
      qrContainer.appendChild(errorElement);

      return qrContainer;
    }
  }

  /**
   * Create the product URL path from product name
   * @param {string} productName - Product name
   * @returns {string} URL path for product
   */
  createProductUrlPath(productName) {
    // The ONLY correct way to create URL path is from product_name
    return productName
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }

  /**
   * Render the product card
   * @returns {Promise<HTMLElement>} The product card element
   */
  async render() {
    const { title, artist, price, id } = this.formattedData;

    // Create card container
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.position = 'relative';

    // Add remove button with improved styling
    const removeButton = document.createElement('button');
    removeButton.className = 'remove-card';
    removeButton.innerHTML = '×';
    removeButton.dataset.productId = this.product.id;
    Object.assign(removeButton.style, {
      position: 'absolute',
      top: '4px',
      left: '4px',
      width: '12px',
      height: '12px',
      padding: '0',
      background: '#ff4444',
      color: 'white',
      border: 'none',
      borderRadius: '2px',
      fontSize: '12px',
      lineHeight: '1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      zIndex: '100',
      opacity: '0.8',
      transition: 'opacity 0.2s ease'
    });

    // Add hover effect
    removeButton.addEventListener('mouseenter', () => {
      removeButton.style.opacity = '1';
    });
    removeButton.addEventListener('mouseleave', () => {
      removeButton.style.opacity = '0.8';
    });

    // Handle remove button click with improved error handling and logging
    removeButton.onclick = async (event) => {
      event.stopPropagation(); // Prevent event bubbling
      console.log('🔥 Remove button clicked:', {
        productId: this.product.id,
        productData: this.product,
        event,
        button: event.target
      });

      try {
        // Find the page container
        const pageContainer = event.target.closest('.printable-page');
        if (!pageContainer) {
          throw new Error('Could not find page container');
        }

        const pageId = pageContainer.dataset.pageId;
        if (!pageId) {
          throw new Error('No page ID found in container');
        }

        // Fetch current page data
        const pageResponse = await fetch(`/api/pages/${pageId}`);
        if (!pageResponse.ok) {
          throw new Error(`Failed to fetch page data: ${pageResponse.statusText}`);
        }

        const pageData = await pageResponse.json();
        console.log('🔥 Current page data:', pageData);

        // Parse and update card IDs
        let cardIds = [];
        try {
          cardIds = JSON.parse(pageData.card_ids || '[]');
          if (!Array.isArray(cardIds)) {
            cardIds = [];
          }
        } catch (e) {
          console.warn('Failed to parse card_ids, defaulting to empty array:', e);
        }

        // Remove ONLY the first instance of the current product ID
        let updatedCardIds = [...cardIds]; // Clone the array
        const indexToRemove = updatedCardIds.findIndex(id => id === this.product.id);

        if (indexToRemove > -1) {
          console.log(`🔥 Found product ${this.product.id} at index ${indexToRemove} in cardIds. Removing it.`);
          updatedCardIds.splice(indexToRemove, 1); // Remove one item at the found index
        } else {
          console.warn(`🔥 Product ${this.product.id} not found in cardIds array:`, cardIds);
          // Optionally, still proceed to remove the DOM element? Or throw an error?
          // For now, let's proceed to update with the potentially unchanged array, but log warning.
        }

        console.log('🔥 Original card IDs:', cardIds);
        console.log('🔥 Updated card IDs (after splice):', updatedCardIds);

        // Update the page with new card IDs
        const updateResponse = await fetch(`/api/pages/${pageId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            card_ids: JSON.stringify(updatedCardIds)
          })
        });

        if (!updateResponse.ok) {
          throw new Error(`Failed to update page (${updateResponse.status}): ${updateResponse.statusText}`);
        }

        // Remove the card from DOM - More robustly!
        const cardElement = event.target.closest('.product-card');
        if (cardElement && cardElement.parentNode) {
          const cellContainer = cardElement.parentNode; // Get the direct parent container
          // Clear the container - this removes the card and anything else inside
          cellContainer.innerHTML = '';
          console.log('🔥 Cleared cell container content.');
        } else {
          console.error('❌ Could not find card element or its parent container to remove from UI.');
        }

        // Dispatch event for page update
        window.dispatchEvent(new CustomEvent('pageUpdated', {
          detail: { pageId, cardIds: updatedCardIds }
        }));

      } catch (error) {
        console.error('❌ Error removing product:', error);
        alert('Failed to remove product. Please try again.');
      }
    };

    // Generate card structure
    card.innerHTML = `
      <div class="card-layout">
        <div class="info-section">
          <div class="product-title">${title}</div>
          <div class="product-artist">${artist}</div>
          <div class="bottom-section">
            <div class="product-price">${price}</div>
            <div class="product-id">ID: ${id}</div>
          </div>
        </div>
        <div class="qr-container"></div>
      </div>
    `;

    // Add remove button to card
    card.appendChild(removeButton);

    // Hide remove button in print
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        .remove-card {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(style);

    // Append QR code to container
    const qrContainer = card.querySelector('.qr-container');
    let qrElementContainer;
    try {
      qrElementContainer = await this.generateQRCode(this.product);
    } catch (error) {
      console.error('Error generating QR code:', error);
      qrElementContainer = document.createElement('div');
      qrElementContainer.className = "qr-error";
      qrElementContainer.textContent = 'QR Error';
    }
    qrContainer.appendChild(qrElementContainer);

    return card;
  }

  /**
   * Attach this component to a container element
   * @param {HTMLElement} container - The container to attach to
   */
  async attachTo(container) {
    if (!container) {
      throw new Error('Container element is required');
    }

    const card = await this.render();
    container.appendChild(card);
  }
}
