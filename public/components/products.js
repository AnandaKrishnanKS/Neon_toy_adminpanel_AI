import { state } from './state.js';
import { toggleModal, updateUploadPreview } from './utils.js';

export async function loadProducts() {
  const container = document.getElementById('products-table-body');
  container.innerHTML = `<tr><td colspan="6" class="loading-state">Loading product inventory...</td></tr>`;

  // Clear search field on fresh reload
  const searchInput = document.getElementById('product-search');
  if (searchInput) searchInput.value = '';

  try {
    const res = await fetch('/api/products');
    state.productsData = await res.json();
    renderProducts();
  } catch (error) {
    container.innerHTML = `<tr><td colspan="6" class="loading-state" style="color: var(--accent-cancelled)">Error loading products.</td></tr>`;
  }
}

export function renderProducts(products = state.productsData) {
  const container = document.getElementById('products-table-body');
  container.innerHTML = '';

  if (products.length === 0) {
    container.innerHTML = `<tr><td colspan="6" class="loading-state">No products found.</td></tr>`;
    return;
  }

  products.forEach(p => {
    let offerDisplay = '—';
    if (p.offer_title) {
      offerDisplay = `<span style="color: var(--accent-pink); font-weight: 600;">🔥 ${p.offer_title} (${p.discount_percentage}% off)</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${p.image_url || 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=500&q=80'}" class="product-image-cell" alt="${p.name}"></td>
      <td><code>#NT-${p.id.toString().padStart(4, '0')}</code></td>
      <td><strong>${p.name}</strong></td>
      <td>₹${parseFloat(p.price).toFixed(2)}</td>
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

export async function showProductForm(id = null) {
  const modal = document.getElementById('product-modal');
  const title = document.getElementById('product-modal-title');
  const form = document.getElementById('product-form');

  form.reset();
  await populateOfferDropdown();

  if (id) {
    title.textContent = 'Edit Product Details';
    const p = state.productsData.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById('product-id').value = p.id;
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-price').value = p.price;
    document.getElementById('product-offer').value = p.offer_id || '';
    document.getElementById('product-desc').value = p.description || '';
    
    // Sync the image preview UI (with fallback to image_url)
    const prodImages = p.images || (p.image_url ? [p.image_url] : []);
    updateUploadPreview('product', prodImages);
  } else {
    title.textContent = 'Add New Product';
    document.getElementById('product-id').value = '';
    
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

  const data = {
    name: document.getElementById('product-name').value,
    price: parseFloat(document.getElementById('product-price').value),
    image_url: document.getElementById('product-image').value, // Backward compatibility
    images: images,
    offer_id: document.getElementById('product-offer').value || null,
    description: document.getElementById('product-desc').value
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
