/**
 * ProductCard Component
 * THE ONLY WAY to display a product card in the application.
 * Any time you need to show a product card, use this class.
 */
export class ProductCard {
  /**
   * Create a new ProductCard instance
   * @param {Object} product - The product data to display
   */
  constructor(product) {
    console.log('🔥 PRODUCT CARD: Creating new card with product:', {
      id: product?.id,
      title: product?.title,
      price: product?.price,
      variants: product?.variants
    });

    if (!product) {
      console.error('🚨 PRODUCT CARD: No product data provided');
      throw new Error('Product data is required');
    }

    this.product = product;
    this.formattedData = this.formatProductData();
    console.log('✅ PRODUCT CARD: Card created successfully');
  }

  /**
   * Generate HTML for QR code component
   * Uses the global QRCodeComponent instance
   * @returns {Promise<string>} Data URL of the QR code
   */
  async generateQRCode() {
    console.log('🔥 PRODUCT CARD: Generating QR code for URL:', this.formattedData.url);

    if (!window.qrCodeComponent) {
      console.error('🚨 PRODUCT CARD: QRCodeComponent not found globally');
      throw new Error('QRCodeComponent is required but not loaded.');
    }

    // The ONLY correct way to create productUrlPath is from product title/name
    let productUrlPath = '';
    
    if (this.product?.title) {
      // Format the product name for the URL path - this is the ONLY correct way
      productUrlPath = this.product.title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      console.log('🔥 PRODUCT CARD: Created URL path from title:', productUrlPath);
    } else {
      console.error('🚨 PRODUCT CARD: Product title is missing, cannot create URL path');
      throw new Error('Product title is required for QR code generation.');
    }

    try {
      // Use the global QRCodeComponent instance with productUrlPath
      const dataUrl = await window.qrCodeComponent.generateQR({
        productUrlPath: productUrlPath
      });

      console.log('✅ PRODUCT CARD: QR code generated successfully via QRCodeComponent');
      return dataUrl;
    } catch (error) {
      console.error('🚨 PRODUCT CARD: Error generating QR code via QRCodeComponent:', error);
      throw error;
    }
  }

  /**
   * Format product information for display
   * @returns {Object} Formatted product data
   */
  formatProductData() {
    console.log('🔥 PRODUCT CARD: Formatting product data');
    const { id, title, vendor, price, url, type } = this.product;

    // Check for required fields
    const requiredFields = { id, title, vendor, price, url };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => value === undefined)
      .map(([field]) => field);

    if (missingFields.length > 0) {
      console.error('🚨 PRODUCT CARD: Missing required fields:', missingFields);
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    console.log('🔥 PRODUCT CARD: Price data:', {
      rawPrice: price,
      formattedPrice: typeof price === 'number' ? `$${price.toFixed(2)}` : price
    });

    // Extract numeric ID from Shopify ID
    let numericId = '';
    if (typeof id === 'string' && id.includes('gid://shopify/Product/')) {
      numericId = id.split('/').pop();
    } else {
      numericId = id;
    }

    return {
      id: numericId,
      title,
      artist: vendor,
      price: typeof price === 'number' ? `$${price.toFixed(2)}` : price,
      url
    };
  }

  /**
   * Render the product card within the cell container
   * @returns {string} HTML for the product card and container
   */
  render() {
    console.log('🔥 PRODUCT CARD: Rendering product card');
    const { title, artist, price, id } = this.formattedData;
    console.log('🔥 PRODUCT CARD: Formatted data for rendering:', {
      title,
      artist,
      price,
      id
    });

    const html = `
      <div class="product-card">
        <table class="product-table">
          <tr>
            <td colspan="2" rowspan="2" class="product-title">${title}</td>
            <td rowspan="5" class="qr-container">
              <img src="${this.qrCodeDataUrl}" alt="QR Code" />
            </td>
          </tr>
          <tr></tr>
          <tr>
            <td colspan="2" class="product-artist">${artist || ''}</td>
          </tr>
          <tr>
            <td colspan="2" class="product-id">ID: ${id}</td>
          </tr>
          <tr>
            <td class="product-price">${price}</td>
            <td></td>
          </tr>
        </table>
      </div>
    `;

    console.log('✅ PRODUCT CARD: HTML generated:', html);
    return html;
  }

  /**
   * Create a new product card and attach it to a DOM element
   * @param {string|HTMLElement} container - Container element or selector
   * @returns {ProductCard} This instance for chaining
   */
  async attachTo(container) {
    console.log('🔥 PRODUCT CARD: Attaching card to container:', container);

    if (!container) {
      console.error('🚨 PRODUCT CARD: No container element provided');
      throw new Error('Container element is required');
    }

    try {
      // Generate QR code
      this.qrCodeDataUrl = await this.generateQRCode();

      // Render and attach
      container.innerHTML += this.render();
      console.log('✅ PRODUCT CARD: Card attached successfully');
    } catch (error) {
      console.error('🚨 PRODUCT CARD: Error attaching card:', error);
      throw error;
    }
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProductCard;
}
