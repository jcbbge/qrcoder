/**
 * Product Controller
 * Handles product display and interaction
 */

import { addProductToPage } from './pageDesignerController.js';
import { ProductCard } from './ProductCard.js';

export function showProducts(products) {
  console.log('showProducts called with:', products);
  const productList = document.getElementById('product-list');

  if (!products || products.length === 0) {
    console.log('No products to display');
    productList.innerHTML = '<div class="no-data">No products found for this vendor</div>';
    return;
  }

  console.log('Rendering products:', products.length);

  // Clear existing content
  productList.innerHTML = '';

  // Create product cards using our standardized ProductCard class
  products.forEach(product => {
    const listItem = document.createElement('div');
    listItem.className = `selection-product-item ${product.synced ? 'product-synced' : 'product-unsynced'}`;
    listItem.dataset.id = product.id;

    // Create the product card using our standardized component
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

    productList.appendChild(listItem);
  });

  // Add click event to "Add" buttons
  productList.querySelectorAll('.selection-product-add').forEach(button => {
    button.addEventListener('click', () => {
      const productId = button.dataset.id;
      const productItem = button.closest('.selection-product-item');

      console.log('[UI] Add button clicked for product:', {
        id: productId,
        element: productItem ? 'found' : 'not_found'
      });

      const product = {
        id: productId,
        title: productItem.querySelector('.selection-product-title').textContent.replace('●', '').trim(),
        vendor: productItem.querySelector('.selection-product-vendor').textContent,
        price: productItem.querySelector('.selection-product-price').textContent
      };

      console.log('[UI] Attempting to add product to page:', product);

      const added = addProductToPage(product);

      console.log('[UI] Product add result:', {
        id: productId,
        success: added
      });

      if (added) {
        console.log('[UI] Updating product position info for:', productId);
        updateProductPositionInfo(productId, productItem);
      } else {
        console.log('[UI] Failed to add product to page:', productId);
      }
    });
  });
}

function updateProductPositionInfo(productId, productItem) {
  const pageDesigner = window.pageDesigner;
  if (!pageDesigner) return;

  const products = pageDesigner.getProducts();
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
