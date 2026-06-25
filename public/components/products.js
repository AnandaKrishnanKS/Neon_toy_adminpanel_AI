import { state } from './state.js';
import { toggleModal, updateUploadPreview } from './utils.js';

export async function loadProducts() {
  const container = document.getElementById('products-table-body');
  container.innerHTML = `<tr><td colspan="7" class="loading-state">Loading product inventory...</td></tr>`;

  // Clear search field on fresh reload
  const searchInput = document.getElementById('product-search');
  if (searchInput) searchInput.value = '';

  try {
    const res = await fetch('/api/products');
    state.productsData = await res.json();
    renderProducts();
  } catch (error) {
    container.innerHTML = `<tr><td colspan="7" class="loading-state" style="color: var(--accent-cancelled)">Error loading products.</td></tr>`;
  }
}

export function renderProducts(products = state.productsData) {
  const container = document.getElementById('products-table-body');
  container.innerHTML = '';

  if (products.length === 0) {
    container.innerHTML = `<tr><td colspan="7" class="loading-state">No products found.</td></tr>`;
    return;
  }

  products.forEach(p => {
    let offerDisplay = '—';
    if (p.offer_title) {
      offerDisplay = `<span style="color: var(--accent-pink); font-weight: 600;">🔥 ${p.offer_title} (${p.discount_percentage}% off)</span>`;
    }

    let stockDisplay = '';
    const stock = p.stock_count !== undefined && p.stock_count !== null ? parseInt(p.stock_count) : 0;
    if (stock === 0) {
      stockDisplay = `<span class="stock-badge out">Out of Stock</span>`;
    } else if (stock < 10) {
      stockDisplay = `<span class="stock-badge low">Low Stock (${stock})</span>`;
    } else {
      stockDisplay = `<span class="stock-badge in">${stock} units</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${p.image_url || 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=500&q=80'}" class="product-image-cell" alt="${p.name}"></td>
      <td><code>#NT-${p.id.toString().padStart(4, '0')}</code></td>
      <td><strong>${p.name}</strong></td>
      <td><span class="category-badge">${p.category || '—'}</span></td>
      <td>₹${parseFloat(p.price).toFixed(2)}</td>
      <td>${stockDisplay}</td>
      <td>${offerDisplay}</td>
      <td>
        <button class="edit-btn" onclick="editProduct(${p.id})" title="Edit Product">✏️</button>
        <button class="delete-btn" onclick="deleteProduct(${p.id})" title="Delete Product">🗑️</button>
      </td>
    `;
    container.appendChild(tr);
  });
}

export function filterProducts(e) {
  const query = e.target.value.toLowerCase();
  const filtered = state.productsData.filter(p => 
    (p.name && p.name.toLowerCase().includes(query)) || 
    (p.description && p.description.toLowerCase().includes(query)) ||
    (p.category && p.category.toLowerCase().includes(query)) ||
    (p.id && `#nt-${p.id.toString().padStart(4, '0')}`.includes(query)) ||
    (p.offer_title && p.offer_title.toLowerCase().includes(query))
  );
  renderProducts(filtered);
}

export async function populateOfferDropdown() {
  const dropdown = document.getElementById('product-offer');
  
  // Maintain current option
  dropdown.innerHTML = `<option value="">No Active Promotion (Regular Price)</option>`;

  try {
    const res = await fetch('/api/offers');
    const offers = await res.json();
    const activeOffers = offers.filter(o => o.is_active);

    activeOffers.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = `${o.title} (${o.discount_percentage}% Off)`;
      dropdown.appendChild(opt);
    });
  } catch (e) {
    console.error('Failed to populate offers dropdown selection:', e);
  }
}

export async function populateCategoryDropdown() {
  const dropdown = document.getElementById('product-category');
  if (!dropdown) return;

  dropdown.innerHTML = `
    <option value="">No Category</option>
    <option value="__NEW_CATEGORY__">+ Add New Category...</option>
  `;

  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();

    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      // Insert before "+ Add New Category..." option
      dropdown.insertBefore(opt, dropdown.lastElementChild);
    });
  } catch (e) {
    console.error('Failed to populate categories dropdown selection:', e);
  }
}

export async function showProductForm(id = null) {
  const modal = document.getElementById('product-modal');
  const title = document.getElementById('product-modal-title');
  const form = document.getElementById('product-form');

  form.reset();
  await populateOfferDropdown();
  await populateCategoryDropdown();

  // Hide the custom new-category input and make it not required by default
  const newCatInput = document.getElementById('new-product-category');
  if (newCatInput) {
    newCatInput.style.display = 'none';
    newCatInput.required = false;
    newCatInput.value = '';
  }

  if (id) {
    title.textContent = 'Edit Product Details';
    const p = state.productsData.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById('product-id').value = p.id;
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-price').value = p.price;
    document.getElementById('product-stock').value = p.stock_count !== undefined && p.stock_count !== null ? p.stock_count : 0;
    document.getElementById('product-offer').value = p.offer_id || '';
    document.getElementById('product-desc').value = p.description || '';
    
    // Set category dropdown. If it is an existing category not yet in the select, add it dynamically.
    const categorySelect = document.getElementById('product-category');
    if (categorySelect) {
      const exists = Array.from(categorySelect.options).some(opt => opt.value === p.category);
      if (p.category && !exists) {
        const opt = document.createElement('option');
        opt.value = p.category;
        opt.textContent = p.category;
        categorySelect.insertBefore(opt, categorySelect.lastElementChild);
      }
      categorySelect.value = p.category || '';
    }
    
    // Sync the image preview UI (with fallback to image_url)
    const prodImages = p.images || (p.image_url ? [p.image_url] : []);
    updateUploadPreview('product', prodImages);
  } else {
    title.textContent = 'Add New Product';
    document.getElementById('product-id').value = '';
    document.getElementById('product-stock').value = 0;
    
    // Clear the image preview UI
    updateUploadPreview('product', []);
  }

  toggleModal('product-modal', true);
}

export async function handleProductSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('product-id').value;
  
  let images = [];
  try {
    images = JSON.parse(document.getElementById('product-images').value || '[]');
  } catch (e) {
    images = [];
  }

  let categoryValue = document.getElementById('product-category').value;
  if (categoryValue === '__NEW_CATEGORY__') {
    categoryValue = document.getElementById('new-product-category').value.trim();
    if (categoryValue) {
      // Add the new category to the dropdown options so it is immediately present and selected
      const categorySelect = document.getElementById('product-category');
      if (categorySelect) {
        const exists = Array.from(categorySelect.options).some(opt => opt.value.toLowerCase() === categoryValue.toLowerCase());
        if (!exists) {
          const opt = document.createElement('option');
          opt.value = categoryValue;
          opt.textContent = categoryValue;
          categorySelect.insertBefore(opt, categorySelect.lastElementChild);
        }
        categorySelect.value = categoryValue;
      }
    }
  }

  const data = {
    name: document.getElementById('product-name').value,
    price: parseFloat(document.getElementById('product-price').value),
    stock_count: parseInt(document.getElementById('product-stock').value) || 0,
    image_url: document.getElementById('product-image').value, // Backward compatibility
    images: images,
    offer_id: document.getElementById('product-offer').value || null,
    description: document.getElementById('product-desc').value,
    category: categoryValue
  };

  const url = id ? `/api/products/${id}` : '/api/products';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      toggleModal('product-modal', false);
      loadProducts();
    } else {
      const err = await res.json();
      alert('Error saving product: ' + err.error);
    }
  } catch (error) {
    alert('Failed to save product information.');
  }
}

export async function deleteProduct(id) {
  if (!confirm('Are you sure you want to permanently delete this product from inventory?')) {
    return;
  }

  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadProducts();
    } else {
      const err = await res.json();
      alert('Error deleting product: ' + err.error);
    }
  } catch (e) {
    alert('Failed to delete product.');
  }
}

// Bind to window for HTML click triggers
window.editProduct = showProductForm;
window.deleteProduct = deleteProduct;
