// QR Code Component - Single source of truth for QR code generation
export class QRCodeComponent {
  constructor() {
    this.STORE_URL = 'https://harding-art-show.myshopify.com';
    this.QR_SIZE = 128;
    this.QR_MARGIN = 0;
    this.TEMP_DIV_PREFIX = 'qr-temp-';
    this.counter = 0;
    this.hidePopupTimer = null; // Add timer variable for hover delay
    this.activePopup = null; // Keep track of the currently active popup
  }

  /**
   * Generate product URL from product URL path
   * @param {string} productUrlPath - Product URL path derived from product name
   * @returns {string} Full product URL
   */
  getProductUrl(productUrlPath) {
    return `${this.STORE_URL}/products/${productUrlPath}`;
  }

  /**
   * Clean up temporary DOM elements
   * @param {string} tempId - ID of temporary element
   */
  cleanup(tempId) {
    try {
      const element = document.getElementById(tempId);
      if (element) {
        document.body.removeChild(element);
      }
    } catch (error) {
      console.error('[QRCode] Cleanup error:', error);
    }
  }

  /**
   * Create a temporary container for QR code generation
   * @returns {{ id: string, element: HTMLElement }} Temporary container info
   */
  createTempContainer() {
    const id = `${this.TEMP_DIV_PREFIX}${this.counter++}`;
    const element = document.createElement('div');
    element.id = id;
    element.style.position = 'absolute';
    element.style.left = '-9999px';
    document.body.appendChild(element);
    return { id, element };
  }

  /**
   * Generate QR code for a product
   * @param {Object} product - Product object with handle property from Shopify
   * @param {Object} options - Optional configuration { size, margin, dark, light }
   * @returns {Promise<string>} Data URL of generated QR code
   */
  async generateQR(product, options = {}) {
    let targetUrl = '';

    // --- URL Determination Logic ---
    if (product?.onlineStoreUrl) {
      targetUrl = product.onlineStoreUrl;
      console.log(`[QRCode] Using onlineStoreUrl: ${targetUrl}`);
    } else if (product?.handle) {
      targetUrl = `${this.STORE_URL}/products/${product.handle}`;
      console.log(`[QRCode] Using handle to construct URL: ${targetUrl}`);
    } else {
      console.error('[QRCode] Missing onlineStoreUrl and handle in product object:', product);
      throw new Error('[QRCode] Product onlineStoreUrl or handle is required');
    }
    // --- End URL Determination Logic ---

    const tempContainer = this.createTempContainer();

    return new Promise((resolve, reject) => {
      try {
        // Use the Shopify handle to generate the URL
        const productUrl = targetUrl;

        console.log('[QRCode] Generating QR code for URL:', productUrl);

        new QRCode(tempContainer.element, {
          text: productUrl,
          width: options.size || this.QR_SIZE,
          height: options.size || this.QR_SIZE,
          colorDark: options.dark || "#000000",
          colorLight: options.light || "#ffffff",
          correctLevel: QRCode.CorrectLevel.H,
          margin: options.margin ?? this.QR_MARGIN,
          onError: (err) => {
            this.cleanup(tempContainer.id);
            console.error('[QRCode] Generation error:', err);
            reject(err);
          }
        });

        const canvas = tempContainer.element.querySelector('canvas');
        if (!canvas) {
          throw new Error('[QRCode] Canvas element not found');
        }

        const dataUrl = canvas.toDataURL('image/png');
        this.cleanup(tempContainer.id);

        // Log success before resolving
        console.log('[QRCode] Successfully generated QR code for URL:', productUrl);

        resolve(dataUrl);

      } catch (error) {
        this.cleanup(tempContainer.id);
        console.error('[QRCode] Generation failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Create a QR code element in the DOM
   * @param {Object} product - Product object with handle property from Shopify
   * @param {HTMLElement} container - Container element to append QR code to
   * @param {Object} options - Optional configuration
   * @returns {Promise<HTMLElement>} Container with QR code
   */
  async createQRElement(product, container, options = {}) {
    console.log(`[QRCode Debug] createQRElement START for product: ${product.title || product.handle || product.onlineStoreUrl}`); // Use onlineStoreUrl in log
    try {
      const qrData = await this.generateQR(product, options);

      // Create container for QR code with hover functionality
      const qrContainer = document.createElement('div');
      qrContainer.className = 'qr-code-container';

      // Create the actual QR code image
      const img = document.createElement('img');
      img.src = qrData;
      img.className = 'qr-code-image';
      img.alt = `QR Code for ${product.title}`;

      // Determine URL to use for popup/data attribute
      let displayUrl = '';
      if (product?.onlineStoreUrl) {
        displayUrl = product.onlineStoreUrl;
      } else if (product?.handle) {
        displayUrl = `${this.STORE_URL}/products/${product.handle}`;
      } else {
        console.warn('[QRCode] Cannot determine display URL for popup');
        displayUrl = '#error-no-url'; // Fallback
      }
      img.dataset.productUrl = displayUrl; // Store the determined URL

      // Add the QR code image to the container
      qrContainer.appendChild(img);

      // Create an absolutely positioned popup that's shown on hover
      const popupContainer = document.createElement('div');
      popupContainer.className = 'qr-preview-popup';
      console.log(`[QRCode Debug] Created popup element with class: ${popupContainer.className}`);
      document.body.appendChild(popupContainer);
      console.log('[QRCode Debug] Appended popup element to document.body');

      // Add the popup content (Using image_url for thumbnail)
      console.log(`[QRCode Debug] Product Image URL for popup: ${product.image_url}`);
      popupContainer.innerHTML = `
        <div class="qr-popup-title">${product.title || 'Product'}</div>
        <div class="qr-popup-url">${displayUrl}</div>
        <div class="qr-popup-bottom-row">
          ${product.image_url ? `<img src="${product.image_url}" class="qr-popup-image" alt="Product Thumbnail">` : '<div class="qr-popup-no-image"></div>'}
          <div class="qr-popup-details">
            ${product.price !== undefined ? `<div class="qr-popup-price">$${Number(product.price).toFixed(2)}</div>` : ''}
            <a href="${displayUrl}" target="_blank" class="qr-popup-link">View Product</a>
          </div>
        </div>
        `;

      // ---- NEW JS POSITIONING & HOVER DELAY LOGIC ----
      const showPopup = () => {
        console.log('[QRCode Debug] MOUSE ENTER qrContainer/popupContainer - Showing/Keeping popup');
        // Clear any pending hide timer
        clearTimeout(this.hidePopupTimer);
        this.hidePopupTimer = null;

        // Hide any other active popup immediately
        if (this.activePopup && this.activePopup !== popupContainer) {
           this.activePopup.style.opacity = '0';
           this.activePopup.style.visibility = 'hidden';
           this.activePopup.style.pointerEvents = 'none';
        }

        // Calculate position
        const rect = qrContainer.getBoundingClientRect();
        const popupHeight = popupContainer.offsetHeight;
        const popupWidth = popupContainer.offsetWidth;
        let popupTop = rect.top + window.scrollY - popupHeight - 8; // 8px gap above
        let popupLeft = rect.left + window.scrollX + (rect.width / 2) - (popupWidth / 2); // Centered horizontally
        if (popupTop < window.scrollY) popupTop = window.scrollY + 5;
        if (popupLeft < window.scrollX) popupLeft = window.scrollX + 5;

        // Position and show
        popupContainer.style.position = 'absolute';
        popupContainer.style.top = `${popupTop}px`;
        popupContainer.style.left = `${popupLeft}px`;
        popupContainer.style.visibility = 'visible'; // Make visible before fade-in
        popupContainer.style.opacity = '1';
        popupContainer.style.pointerEvents = 'auto'; // Enable pointer events for interaction
        this.activePopup = popupContainer; // Set as active popup
        console.log(`[QRCode Debug] Popup positioned at top: ${popupTop}px, left: ${popupLeft}px`);
      };

      const startHideTimer = () => {
        console.log('[QRCode Debug] MOUSE LEAVE qrContainer/popupContainer - Starting hide timer');
        // Clear any existing timer before starting a new one
        clearTimeout(this.hidePopupTimer);
        this.hidePopupTimer = setTimeout(() => {
           console.log('[QRCode Debug] Hide timer expired - Hiding popup');
           popupContainer.style.opacity = '0';
           popupContainer.style.pointerEvents = 'none'; // Disable pointer events while hidden
           // Optionally reset visibility after transition
           // setTimeout(() => { popupContainer.style.visibility = 'hidden'; }, 300);
           if (this.activePopup === popupContainer) {
               this.activePopup = null;
           }
           this.hidePopupTimer = null;
        }, 300); // 300ms delay before hiding
      };

      qrContainer.addEventListener('mouseenter', showPopup);
      popupContainer.addEventListener('mouseenter', showPopup); // Keep open when mouse enters popup

      qrContainer.addEventListener('mouseleave', startHideTimer);
      popupContainer.addEventListener('mouseleave', startHideTimer); // Hide when mouse leaves popup
      // ---- END NEW JS LOGIC ----

      // Add the QR container to the main container
      container.appendChild(qrContainer);

      // Add CSS styles for the popup if not already present
      this.ensurePopupStyles();

      return container;
    } catch (error) {
      console.error('[QRCode] Element creation failed:', error);
      throw error;
    }
  }

  /**
   * Note: This method is no longer used since we're creating the iframe directly in the popup HTML
   * Kept for backward compatibility
   * @param {string} url - URL to the product
   * @param {HTMLElement} container - Element to place preview in
   */
  async loadPreview(url, container) {
    // This method is kept for backward compatibility
    console.log('[QRCode] loadPreview is deprecated - iframe is now created directly');
  }

  /**
   * Ensure the popup styles are added to the document
   */
  ensurePopupStyles() {
    // Check if styles are already added
    if (document.getElementById('qr-popup-styles')) {
      console.log('[QRCode Debug] ensurePopupStyles: Styles already exist, skipping.'); // LOG SKIP
      return;
    }
    console.log('[QRCode Debug] ensurePopupStyles: Adding styles to head.'); // LOG ADD
    // Create style element
    const style = document.createElement('style');
    style.id = 'qr-popup-styles';
    style.innerHTML = `
        /* QR Code Container with relative positioning */
        .qr-code-container {
          position: relative;
          display: inline-block; /* Keep inline-block for layout */
          /* cursor: pointer; Removed, handled by image hover */
        }

        /* QR Code Image with hover effect */
        .qr-code-image {
          display: block;
          transition: transform 0.2s ease;
        }
        .qr-code-container:hover .qr-code-image { /* Apply hover to container for reliability */
          transform: scale(1.05);
        }

        /* Popup container - hidden by default */
        /* Use the new class name .qr-preview-popup */
        .qr-preview-popup {
          position: absolute;
          /* width: 280px; */ /* Allow width to adjust */
          min-width: 200px; /* Set a minimum width */
          max-width: 260px; /* Set a maximum width */
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          box-shadow: 0 3px 10px rgba(0,0,0,0.2);
          padding: 8px; /* Reduced padding */
          z-index: 9999;
          visibility: hidden;
          opacity: 0; /* Start transparent */
          transition: opacity 0.3s ease;
          pointer-events: none; /* Default to none, JS enables */
        }

        /* Arrow pointing down */
        .qr-preview-popup:after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          margin-left: -6px; /* Smaller arrow */
          border-width: 6px;
          border-style: solid;
          border-color: white transparent transparent transparent;
        }

        /* Popup content styling */
        .qr-popup-title {
          font-weight: bold;
          margin-bottom: 3px; /* Reduced margin */
          font-size: 13px; /* Reduced size */
          color: #333;
          white-space: nowrap; /* Prevent wrapping */
          overflow: hidden;
          text-overflow: ellipsis; /* Add ellipsis for long titles */
        }

        .qr-popup-url {
          font-size: 10px; /* Reduced size */
          color: #666;
          margin-bottom: 5px; /* Reduced margin */
          word-break: break-all;
          background: #f5f5f5;
          padding: 3px; /* Reduced padding */
          border-radius: 3px;
          font-family: monospace;
        }

        /* Styles for the bottom row layout */
        .qr-popup-bottom-row {
          display: flex;
          align-items: center; /* Align items vertically */
          gap: 8px; /* Space between image and details */
          margin-top: 5px;
        }

        .qr-popup-image {
          flex-shrink: 0; /* Prevent image from shrinking */
          width: 50px; /* Fixed small width */
          height: 50px; /* Fixed small height */
          object-fit: cover; /* Cover the area */
          border: 1px solid #eee;
          margin: 0; /* Remove auto margins */
          border-radius: 3px;
        }
        .qr-popup-no-image {
          flex-shrink: 0;
          width: 50px;
          height: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px dashed #ccc;
          color: #999;
          font-size: 9px;
          text-align: center;
          border-radius: 3px;
        }
        .qr-popup-details {
          flex-grow: 1; /* Allow details section to take remaining space */
          display: flex;
          flex-direction: column; /* Stack price and button */
          gap: 4px; /* Space between price and button */
        }
        .qr-popup-price {
          font-weight: bold;
          margin: 0; /* Remove margin */
          font-size: 12px; /* Reduced size */
        }
        .qr-popup-link {
          display: block;
          margin-top: 0; /* Remove margin */
          padding: 5px 8px; /* Reduced padding */
          background-color: #3498db;
          color: white;
          text-align: center;
          text-decoration: none;
          border-radius: 4px;
          transition: background-color 0.2s ease;
          font-size: 11px; /* Reduced size */
        }
        .qr-popup-link:hover {
          background-color: #2980b9;
        }
      `;

    // Add styles to head
    document.head.appendChild(style);
  }
}

// Initialize a global instance
// window.qrCodeComponent = new QRCodeComponent(); // REMOVED THIS LINE
