import { ProductCard } from './ProductCard.js';

/**
 * Vendor Search Controller
 */

// Make it work both as a module and direct script
let exportedInitVendorSearch;

(function(global) {
  console.log('Vendor Search Controller loading...');

  function initVendorSearch() {
    console.log('initVendorSearch called');
    const searchInput = document.getElementById('vendor-search');
    const resultsContainer = document.getElementById('vendor-search-results');
    const productList = document.getElementById('product-list');
    const addAllBtn = document.getElementById('add-all-header-btn');

    if (!searchInput || !resultsContainer || !productList || !addAllBtn) {
      console.error('Required DOM elements not found:', {
        searchInput: !!searchInput,
        resultsContainer: !!resultsContainer,
        productList: !!productList,
        addAllBtn: !!addAllBtn
      });
      return;
    }

    console.log('Found all required DOM elements, attaching listeners');

    // Clear any existing listeners
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);

    // Attach new listener
    newSearchInput.addEventListener('input', debounce(searchVendors, 300));

    // Add click outside handler
    document.addEventListener('click', (e) => {
      if (!resultsContainer.contains(e.target) && !newSearchInput.contains(e.target)) {
        resultsContainer.innerHTML = '';
      }
    });

    // Add event listeners
    addAllBtn.addEventListener('click', handleAddAll);
  }

  // Search Shopify for vendors matching the input
  async function searchVendors(event) {
    const term = event.target.value.trim();
    const resultsContainer = document.getElementById('vendor-search-results');

    if (!resultsContainer) return;

    // Clear results if input is too short
    if (!term || term.length < 2) {
      resultsContainer.innerHTML = '';
      return;
    }

    // Show loading state
    resultsContainer.innerHTML = '<div class="loading">Searching...</div>';

    try {
      const response = await fetch(`/api/shopify/vendors?query=${encodeURIComponent(term)}`);

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const vendors = await response.json();

      if (!vendors || vendors.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No vendors found</div>';
        return;
      }

      // Create results HTML
      const resultsHtml = vendors.map(vendor =>
        `<div class="vendor-result" data-vendor="${encodeURIComponent(vendor)}">${vendor}</div>`
      ).join('');

      resultsContainer.innerHTML = resultsHtml;

      // Add click handlers
      Array.from(resultsContainer.getElementsByClassName('vendor-result')).forEach(el => {
        el.addEventListener('click', () => {
          const vendorName = decodeURIComponent(el.dataset.vendor);
          document.getElementById('vendor-search').value = vendorName;
          resultsContainer.innerHTML = '';
          loadVendorProducts(vendorName);
        });
      });
    } catch (error) {
      resultsContainer.innerHTML = `<div class="error">Search failed: ${error.message}</div>`;
    }
  }

  // Load products for a selected vendor
  async function loadVendorProducts(vendorName) {
    const productList = document.getElementById('product-list');
    if (!productList) throw new Error('Product list container not found');

    try {
      // Clear existing content
      productList.innerHTML = '<div class="loading">Loading products...</div>';

      console.log('�� VENDOR CONTROLLER: Starting API fetch for vendor:', vendorName);
      // Fetch products from Shopify API
      const response = await fetch(`/api/shopify/products/vendor/${encodeURIComponent(vendorName)}`);
      console.log('🔥 VENDOR CONTROLLER: API Response status:', response.status);

      if (!response.ok) {
        console.error('🚨 VENDOR CONTROLLER: API Error:', response.status, response.statusText);
        throw new Error(`Failed to fetch products: ${response.status}`);
      }

      const shopifyProducts = await response.json();
      console.log('🔥 VENDOR CONTROLLER: Raw Shopify products:', shopifyProducts);

      if (!shopifyProducts || shopifyProducts.length === 0) {
        console.log('🔥 VENDOR CONTROLLER: No products found');
        productList.innerHTML = '<div class="no-data">No products found for this vendor</div>';
        return;
      }

      // Get or create product cards
      console.log('🔥 VENDOR CONTROLLER: Fetching existing cards for products:',
        shopifyProducts.map(p => ({ id: p.id, title: p.title }))
      );

      const existingCards = await getOrCreateProductCards(shopifyProducts);
      console.log('🔥 VENDOR CONTROLLER: Existing cards:', existingCards);

      // Create list items container
      const listContainer = document.createElement('div');
      listContainer.className = 'product-list';

      // Create product cards
      shopifyProducts.forEach(product => {
        console.log('🔥 VENDOR CONTROLLER: Processing product:', {
          id: product.id,
          title: product.title,
          price: product.price,
          priceRangeV2: product.priceRangeV2,
          variants: product.variants,
          fullProduct: product
        });

        const productCard = existingCards.find(pc => pc.shopify_id === product.id);
        console.log('🔥 VENDOR CONTROLLER: Found product card:', productCard);

        // Create list item container
        const listItem = document.createElement('div');
        listItem.className = 'selection-product-item';
        listItem.dataset.id = product.id;
        listItem.dataset.cardId = productCard?.id || '';

        // Create the product card
        if (productCard) {
          console.log('🔥 VENDOR CONTROLLER: Creating ProductCard with data:', {
            id: product.id,
            title: product.title,
            vendor: product.vendor,
            price: product.price,
            url: product.onlineStoreUrl
          });

          new ProductCard({
            id: product.id,
            title: product.title,
            vendor: product.vendor,
            price: product.price,
            url: product.onlineStoreUrl
          }).attachTo(listItem);

          // Add action buttons
          const actions = document.createElement('div');
          actions.className = 'selection-product-actions';
          actions.innerHTML = `
            <button class="selection-product-add" data-id="${product.id}">Add</button>
            <div class="selection-product-page">P:- POS:-</div>
          `;
          listItem.appendChild(actions);
        } else {
          // Show syncing state
          listItem.innerHTML = `
            <div class="selection-product-syncing">
              <span class="sync-status">•</span>
              Syncing product...
            </div>
          `;
        }

        listContainer.appendChild(listItem);
      });

      // Replace loading state with product list
      productList.innerHTML = '';
      productList.appendChild(listContainer);

      // Add event listeners for add buttons
      listContainer.querySelectorAll('.selection-product-add').forEach(button => {
        button.addEventListener('click', handleAddProduct);
      });

    } catch (error) {
      console.error('🚨 VENDOR CONTROLLER: Error loading vendor products:', error);
      productList.innerHTML = '<div class="error">Failed to load products</div>';
    }
  }

  // Get or create product cards from Neon
  async function getOrCreateProductCards(shopifyProducts) {
    try {
      console.log('VENDOR CONTROLLER: Starting bulk product card retrieval for products:', {
        count: shopifyProducts.length,
        products: shopifyProducts.map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          variants: p.variants,
          priceRange: p.priceRangeV2
        }))
      });

      // First, try to get existing product cards
      const productIds = shopifyProducts.map(p => p.id).join(',');
      const response = await fetch(`/api/product-cards/bulk?shopify_ids=${encodeURIComponent(productIds)}`);

      if (!response.ok) {
        console.error('VENDOR CONTROLLER: Failed to fetch product cards:', {
          status: response.status,
          statusText: response.statusText
        });
        throw new Error(`Failed to fetch product cards: ${response.status}`);
      }

      let existingCards = await response.json();
      console.log('VENDOR CONTROLLER: Retrieved existing product cards:', {
        count: existingCards.length,
        cards: existingCards
      });

      // Find products without cards
      const productsNeedingCards = shopifyProducts.filter(product =>
        !existingCards.some(card => card.shopify_id === product.id)
      );

      console.log('VENDOR CONTROLLER: Products needing new cards:', {
        count: productsNeedingCards.length,
        products: productsNeedingCards.map(p => ({
          id: p.id,
          title: p.title,
          price: p.price,
          variants: p.variants,
          priceRange: p.priceRangeV2
        }))
      });

      if (productsNeedingCards.length > 0) {
        const productsToCreate = productsNeedingCards.map(product => {
          // Get price from variant first, fall back to price range
          const price = product.variants?.edges?.[0]?.node?.price ||
                       product.priceRangeV2?.minVariantPrice?.amount;

          console.log('VENDOR CONTROLLER: Creating card for product:', {
            id: product.id,
            title: product.title,
            extractedPrice: price,
            variants: product.variants,
            priceRange: product.priceRangeV2
          });

          return {
            shopify_id: product.id,
            product_name: product.title,
            artist_name: product.vendor,
            price: price || '0', // Ensure we never send undefined
            image_url: product.featuredImage?.transformedSrc ||
                      product.images?.edges?.[0]?.node?.transformedSrc ||
                      product.featuredImage?.url ||
                      product.images?.edges?.[0]?.node?.url ||
                      product.featuredImage?.originalSrc ||
                      product.images?.edges?.[0]?.node?.originalSrc,
            onlineStoreUrl: product.onlineStoreUrl || `https://hardingacademy.myshopify.com/products/${product.handle}`,
            status: 'unprocessed'
          };
        });

        // Create cards in bulk
        const createResponse = await fetch('/api/product-cards/bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ products: productsToCreate })
        });

        if (!createResponse.ok) {
          console.error('VENDOR CONTROLLER: Failed to create product cards:', {
            status: createResponse.status,
            statusText: createResponse.statusText
          });
          throw new Error(`Failed to create product cards: ${createResponse.status}`);
        }

        const newCards = await createResponse.json();
        console.log('VENDOR CONTROLLER: Successfully created new product cards:', {
          count: newCards.length,
          cards: newCards
        });

        // Combine existing and new cards
        existingCards = [...existingCards, ...newCards];
      }

      // Update prices for existing cards if they've changed
      const cardsNeedingPriceUpdate = existingCards.map(card => {
        const shopifyProduct = shopifyProducts.find(p => p.id === card.shopify_id);
        if (!shopifyProduct) return null;

        const currentPrice = shopifyProduct.variants?.edges?.[0]?.node?.price ||
                           shopifyProduct.priceRangeV2?.minVariantPrice?.amount;

        if (currentPrice && currentPrice !== card.price) {
          console.log('VENDOR CONTROLLER: Price mismatch detected:', {
            productId: card.shopify_id,
            oldPrice: card.price,
            newPrice: currentPrice
          });
          return {
            ...card,
            price: currentPrice
          };
        }
        return null;
      }).filter(Boolean);

      if (cardsNeedingPriceUpdate.length > 0) {
        console.log('VENDOR CONTROLLER: Updating prices for cards:', {
          count: cardsNeedingPriceUpdate.length,
          updates: cardsNeedingPriceUpdate
        });

        const updateResponse = await fetch('/api/product-cards/bulk', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ products: cardsNeedingPriceUpdate })
        });

        if (!updateResponse.ok) {
          console.error('VENDOR CONTROLLER: Failed to update product card prices:', {
            status: updateResponse.status,
            statusText: updateResponse.statusText
          });
        } else {
          const updatedCards = await updateResponse.json();
          console.log('VENDOR CONTROLLER: Successfully updated card prices:', {
            count: updatedCards.length,
            cards: updatedCards
          });

          // Replace old cards with updated ones
          existingCards = existingCards.map(card =>
            updatedCards.find(u => u.id === card.id) || card
          );
        }
      }

      return existingCards;
    } catch (error) {
      console.error('VENDOR CONTROLLER: Error in getOrCreateProductCards:', error);
      throw error;
    }
  }

  function formatPrice(product) {
    if (!product.priceRangeV2 || !product.priceRangeV2.minVariantPrice) {
      return 'Price not available';
    }
    const { amount, currencyCode } = product.priceRangeV2.minVariantPrice;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode || 'USD'
    }).format(amount);
  }

  // Update position display after adding to page designer
  function updateProductPosition(productId, productItem) {
    if (!window.pageDesigner) return;

    const products = window.pageDesigner.getProducts();
    if (!products) return;

    const index = products.findIndex(p => p && p.id === productId);
    if (index === -1) return;

    const column = index % 2 === 0 ? 'A' : 'B';
    const row = Math.floor(index / 2) + 1;
    const positionId = `${column}${row}`;

    const pageInfo = productItem.querySelector('.selection-product-page');
    if (pageInfo) {
      pageInfo.textContent = `P:1 POS:${positionId}`;
      pageInfo.style.backgroundColor = '#e1f5fe';
      pageInfo.style.color = '#0277bd';
    }
  }

  // Helper for throttling input events
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Handle adding all visible products to the page designer
  async function handleAddAll() {
    const productList = document.getElementById('product-list');
    if (!productList) return;

    const productItems = Array.from(productList.getElementsByClassName('selection-product-item'));
    const enabledButtons = productItems
      .map(item => item.querySelector('.selection-product-add'))
      .filter(button => button && !button.disabled);

    for (const button of enabledButtons) {
      button.click();
    }
  }

  // Add the missing handleAddProduct function
  async function handleAddProduct(event) {
    console.log('�� VENDOR CONTROLLER: handleAddProduct called with event:', event);

    const button = event.currentTarget;
    const productId = button.dataset.id;
    const listItem = button.closest('.selection-product-item');

    if (!productId || !listItem) {
      console.error('🚨 VENDOR CONTROLLER: Missing product ID or list item');
      return;
    }

    console.log('🔥 VENDOR CONTROLLER: Adding product:', productId);

    try {
      // Disable the button while processing
      button.disabled = true;
      button.textContent = 'Adding...';

      // Add to page designer if available
      if (window.pageDesigner) {
        await window.pageDesigner.addProduct(productId);
        console.log('✅ VENDOR CONTROLLER: Product added to page designer:', productId);

        // Update position display
        updateProductPosition(productId, listItem);

        // Update button state
        button.textContent = 'Added';
      } else {
        console.error('🚨 VENDOR CONTROLLER: pageDesigner not available');
        button.textContent = 'Error';
        button.disabled = false;
      }
    } catch (error) {
      console.error('🚨 VENDOR CONTROLLER: Error adding product:', error);
      button.textContent = 'Error';
      button.disabled = false;
    }
  }

  // Assign the function to both the global scope and the module export
  global.initVendorSearch = initVendorSearch;
  exportedInitVendorSearch = initVendorSearch;

  console.log('Vendor search controller loaded and exported');
})(typeof window !== 'undefined' ? window : this);

// Export for ES modules
export const initVendorSearch = exportedInitVendorSearch;
