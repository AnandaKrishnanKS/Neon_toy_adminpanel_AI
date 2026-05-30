// Intercept all fetch requests to handle 401 Unauthorized automatically
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  try {
    const response = await originalFetch(...args);
    if (response.status === 401) {
      window.location.href = '/login';
      return new Promise(() => {}); // Return a pending promise to prevent further execution
    }
    return response;
  } catch (error) {
    throw error;
  }
};

// Global State
let currentSection = 'dashboard';
let usersData = [];
let ordersData = [];
let offersData = [];
let productsData = [];

// Init Page
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initEventListeners();
  loadCurrentSection();
});

/* ==========================================================================
   NAVIGATION MANAGEMENT
   ========================================================================== */

function initNavigation() {
  const menuItems = document.querySelectorAll('.menu-item');
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.getAttribute('data-target');
      
      // Update Active Navigation Item
      menuItems.forEach(mi => mi.classList.remove('active'));
      item.classList.add('active');

      // Update Section Visibility
      document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
      document.getElementById(`sec-${target}`).classList.add('active');

      // Update Page Title
      const titleMap = {
        'dashboard': 'Dashboard Overview',
        'users': 'Registered User Accounts',
        'orders': 'Customer Orders Management',
        'offers': 'Active Deals & Coupons',
        'products': 'Store Inventory Products'
      };
      document.getElementById('section-title').textContent = titleMap[target] || 'ToTToys Console';

      currentSection = target;
      window.location.hash = target;
      loadCurrentSection();
    });
  });

  // Handle URL hash routing
  const hash = window.location.hash.substring(1);
  if (hash) {
    const matchingMenuItem = document.querySelector(`.menu-item[data-target="${hash}"]`);
    if (matchingMenuItem) {
      matchingMenuItem.click();
    }
  }
}

function loadCurrentSection() {
  switch (currentSection) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'users':
      loadUsers();
      break;
    case 'orders':
      loadOrders();
      break;
    case 'offers':
      loadOffers();
      break;
    case 'products':
      loadProducts();
      break;
  }
}

function initEventListeners() {
  // Global Refresh button
  document.getElementById('refresh-btn').addEventListener('click', loadCurrentSection);

  // Users Section Search
  document.getElementById('user-search').addEventListener('input', filterUsers);

  // Orders Section Tab Filters
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderOrders(tab.getAttribute('data-filter'));
    });
  });

  // Modals close triggers
  document.getElementById('close-product-modal').onclick = () => toggleModal('product-modal', false);
  document.getElementById('cancel-product-form').onclick = () => toggleModal('product-modal', false);
  document.getElementById('close-offer-modal').onclick = () => toggleModal('offer-modal', false);
  document.getElementById('cancel-offer-form').onclick = () => toggleModal('offer-modal', false);
  document.getElementById('close-order-modal').onclick = () => toggleModal('order-detail-modal', false);

  // Quick Action Buttons
  document.getElementById('qa-add-product').onclick = () => showProductForm();
  document.getElementById('qa-add-offer').onclick = () => showOfferForm();

  // Primary Add Buttons
  document.getElementById('add-product-btn').onclick = () => showProductForm();
  document.getElementById('add-offer-btn').onclick = () => showOfferForm();

  // Form Submissions
  document.getElementById('product-form').onsubmit = handleProductSubmit;
  document.getElementById('offer-form').onsubmit = handleOfferSubmit;
  document.getElementById('save-order-status-btn').onclick = handleOrderStatusSubmit;

  // Logout Button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if (show) {
    modal.classList.add('open');
  } else {
    modal.classList.remove('open');
  }
}

/* ==========================================================================
   DASHBOARD SECTION
   ========================================================================== */

async function loadDashboard() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();

    document.getElementById('stat-revenue').textContent = `₹${stats.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('stat-users').textContent = stats.users;
    document.getElementById('stat-orders').textContent = stats.orders;
    document.getElementById('stat-offers').textContent = stats.offers;
    document.getElementById('stat-products').textContent = stats.products;

    // Fetch and render the 5 most recent orders
    const ordersRes = await fetch('/api/orders');
    const allOrders = await ordersRes.json();
    const recentOrders = allOrders.slice(0, 5);

    const container = document.getElementById('recent-orders-list');
    container.innerHTML = '';

    if (recentOrders.length === 0) {
      container.innerHTML = `<tr><td colspan="5" class="loading-state">No orders placed yet.</td></tr>`;
      return;
    }

    recentOrders.forEach(o => {
      const dateStr = new Date(o.created_at).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>#NT-${o.id}</strong></td>
        <td>${o.user_email}</td>
        <td>₹${parseFloat(o.total_amount).toFixed(2)}</td>
        <td><span class="status-badge ${o.status.toLowerCase()}">${o.status}</span></td>
        <td>${dateStr}</td>
      `;
      container.appendChild(tr);
    });

    document.getElementById('goto-orders-link').onclick = () => {
      document.querySelector('.menu-item[data-target="orders"]').click();
    };

  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }
}

/* ==========================================================================
   USERS SECTION
   ========================================================================== */

async function loadUsers() {
  const container = document.getElementById('users-table-body');
  container.innerHTML = `<tr><td colspan="7" class="loading-state">Loading user profiles...</td></tr>`;

  try {
    const res = await fetch('/api/users');
    usersData = await res.json();
    renderUsers(usersData);
  } catch (error) {
    container.innerHTML = `<tr><td colspan="7" class="loading-state" style="color: var(--accent-cancelled)">Error loading users.</td></tr>`;
  }
}

function renderUsers(users) {
  const container = document.getElementById('users-table-body');
  container.innerHTML = '';

  if (users.length === 0) {
    container.innerHTML = `<tr><td colspan="7" class="loading-state">No users registered yet.</td></tr>`;
    return;
  }

  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><img src="${u.avatar || 'https://i.pravatar.cc/150'}" class="user-avatar-cell" alt="${u.name}"></td>
      <td><strong>${u.name || 'Anonymous User'}</strong></td>
      <td>${u.email}</td>
      <td>${u.phone || '—'}</td>
      <td>${u.city || '—'}</td>
      <td>${u.address || '—'}</td>
      <td><code>${u.zipcode || '—'}</code></td>
    `;
    container.appendChild(tr);
  });
}

function filterUsers(e) {
  const query = e.target.value.toLowerCase();
  const filtered = usersData.filter(u => 
    (u.name && u.name.toLowerCase().includes(query)) || 
    u.email.toLowerCase().includes(query)
  );
  renderUsers(filtered);
}

/* ==========================================================================
   ORDERS SECTION
   ========================================================================== */

async function loadOrders() {
  const container = document.getElementById('orders-table-body');
  container.innerHTML = `<tr><td colspan="7" class="loading-state">Loading orders...</td></tr>`;

  try {
    const res = await fetch('/api/orders');
    ordersData = await res.json();
    const activeFilter = document.querySelector('.tab-btn.active').getAttribute('data-filter');
    renderOrders(activeFilter);
  } catch (error) {
    container.innerHTML = `<tr><td colspan="7" class="loading-state" style="color: var(--accent-cancelled)">Error loading orders.</td></tr>`;
  }
}

function renderOrders(filter) {
  const container = document.getElementById('orders-table-body');
  container.innerHTML = '';

  const filtered = filter === 'All' 
    ? ordersData 
    : ordersData.filter(o => o.status === filter);

  if (filtered.length === 0) {
    container.innerHTML = `<tr><td colspan="7" class="loading-state">No orders found.</td></tr>`;
    return;
  }

  filtered.forEach(o => {
    const dateStr = new Date(o.created_at).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    
    // Count total items
    let itemCount = 0;
    try {
      const itemsObj = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
      itemCount = itemsObj.reduce((sum, i) => sum + i.quantity, 0);
    } catch (e) {
      itemCount = 0;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#NT-${o.id}</strong></td>
      <td>${o.user_email}</td>
      <td>${itemCount} toy item(s)</td>
      <td><strong>₹${parseFloat(o.total_amount).toFixed(2)}</strong></td>
      <td>${dateStr}</td>
      <td><span class="status-badge ${o.status.toLowerCase()}">${o.status}</span></td>
      <td>
        <button class="details-btn" onclick="viewOrderDetails(${o.id})">👁️ View Details</button>
      </td>
    `;
    container.appendChild(tr);
  });
}

window.viewOrderDetails = function(id) {
  const order = ordersData.find(o => o.id === id);
  if (!order) return;

  document.getElementById('od-id').textContent = order.id;
  document.getElementById('od-date').textContent = new Date(order.created_at).toLocaleString('en-IN');
  document.getElementById('od-total').textContent = `₹${parseFloat(order.total_amount).toFixed(2)}`;
  document.getElementById('od-status-select').value = order.status;

  // Address summary
  let shipping = {};
  try {
    shipping = typeof order.shipping_details === 'string' 
      ? JSON.parse(order.shipping_details) 
      : order.shipping_details;
  } catch (e) {
    shipping = {};
  }

  document.getElementById('od-name').textContent = shipping.name || '—';
  document.getElementById('od-phone').textContent = shipping.phone || '—';
  document.getElementById('od-address').textContent = shipping.address || '—';
  document.getElementById('od-city').textContent = shipping.city || '—';
  document.getElementById('od-zipcode').textContent = shipping.zipcode || '—';
  document.getElementById('od-payment').textContent = shipping.payment_method || 'COD';

  // Items table
  const tbody = document.getElementById('od-items-tbody');
  tbody.innerHTML = '';

  let items = [];
  try {
    items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
  } catch (e) {
    items = [];
  }

  items.forEach(i => {
    const tr = document.createElement('tr');
    const priceVal = parseFloat(i.price || 0);
    tr.innerHTML = `
      <td>${i.name}</td>
      <td>₹${priceVal.toFixed(2)}</td>
      <td>${i.quantity}</td>
      <td><strong>₹${(priceVal * i.quantity).toFixed(2)}</strong></td>
    `;
    tbody.appendChild(tr);
  });

  // Track the current active order ID on the save button
  document.getElementById('save-order-status-btn').setAttribute('data-id', order.id);

  toggleModal('order-detail-modal', true);
};

async function handleOrderStatusSubmit() {
  const id = this.getAttribute('data-id');
  const select = document.getElementById('od-status-select');
  const newStatus = select.value;

  try {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });

    if (res.ok) {
      toggleModal('order-detail-modal', false);
      loadOrders();
    } else {
      const err = await res.json();
      alert('Error updating status: ' + err.error);
    }
  } catch (e) {
    alert('Failed to update order status.');
  }
}

/* ==========================================================================
   OFFERS SECTION
   ========================================================================== */

async function loadOffers() {
  const container = document.getElementById('offers-list-grid');
  container.innerHTML = `<div class="loading-state">Loading offers...</div>`;

  try {
    const res = await fetch('/api/offers');
    offersData = await res.json();
    renderOffers();
  } catch (e) {
    container.innerHTML = `<div class="loading-state" style="color: var(--accent-cancelled)">Error loading active offers.</div>`;
  }
}

function renderOffers() {
  const container = document.getElementById('offers-list-grid');
  container.innerHTML = '';

  if (offersData.length === 0) {
    container.innerHTML = `<div class="loading-state">No offers configured. Click "Create New Offer" to start!</div>`;
    return;
  }

  offersData.forEach(o => {
    const card = document.createElement('div');
    card.className = 'offer-panel-card';
    card.innerHTML = `
      <div class="offer-card-banner" style="background-image: url(${o.banner_url || 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=500&q=80'})">
        <span class="offer-card-badge">${o.badge_text || `${o.discount_percentage}% OFF`}</span>
      </div>
      <div class="offer-card-body">
        <h3>${o.title}</h3>
        <p>${o.description || 'No description provided.'}</p>
        <div style="font-size: 0.9rem;">
          <strong>Discount Percentage:</strong> ${o.discount_percentage}%
        </div>
      </div>
      <div class="offer-card-footer">
        <span class="offer-status-indicator ${o.is_active ? 'active' : 'inactive'}">
          ${o.is_active ? 'Active' : 'Disabled'}
        </span>
        <div class="offer-card-actions">
          <button class="edit-btn" onclick="editOffer(${o.id})" title="Edit Offer">✏️</button>
          <button class="delete-btn" onclick="deleteOffer(${o.id})" title="Delete Offer">🗑️</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function showOfferForm(id = null) {
  const modal = document.getElementById('offer-modal');
  const title = document.getElementById('offer-modal-title');
  const form = document.getElementById('offer-form');

  form.reset();

  if (id) {
    title.textContent = 'Edit Offer Details';
    const o = offersData.find(offer => offer.id === id);
    if (!o) return;

    document.getElementById('offer-id').value = o.id;
    document.getElementById('offer-title').value = o.title;
    document.getElementById('offer-discount').value = o.discount_percentage;
    document.getElementById('offer-badge').value = o.badge_text || '';
    document.getElementById('offer-banner').value = o.banner_url || '';
    document.getElementById('offer-desc').value = o.description || '';
    document.getElementById('offer-active').checked = o.is_active;
  } else {
    title.textContent = 'Create New Offer';
    document.getElementById('offer-id').value = '';
    document.getElementById('offer-active').checked = true;
  }

  toggleModal('offer-modal', true);
}

window.editOffer = function(id) {
  showOfferForm(id);
};

async function handleOfferSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('offer-id').value;
  const data = {
    title: document.getElementById('offer-title').value,
    discount_percentage: parseInt(document.getElementById('offer-discount').value),
    badge_text: document.getElementById('offer-badge').value,
    banner_url: document.getElementById('offer-banner').value,
    description: document.getElementById('offer-desc').value,
    is_active: document.getElementById('offer-active').checked
  };

  const url = id ? `/api/offers/${id}` : '/api/offers';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (res.ok) {
      toggleModal('offer-modal', false);
      loadOffers();
    } else {
      const err = await res.json();
      alert('Error saving offer: ' + err.error);
    }
  } catch (error) {
    alert('Failed to save offer.');
  }
}

window.deleteOffer = async function(id) {
  if (!confirm('Are you sure you want to delete this offer? Any linked toys will have their discounts removed.')) {
    return;
  }

  try {
    const res = await fetch(`/api/offers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadOffers();
    } else {
      const err = await res.json();
      alert('Error deleting offer: ' + err.error);
    }
  } catch (e) {
    alert('Failed to delete offer.');
  }
};

/* ==========================================================================
   PRODUCTS SECTION
   ========================================================================== */

async function loadProducts() {
  const container = document.getElementById('products-table-body');
  container.innerHTML = `<tr><td colspan="6" class="loading-state">Loading product inventory...</td></tr>`;

  try {
    const res = await fetch('/api/products');
    productsData = await res.json();
    renderProducts();
  } catch (error) {
    container.innerHTML = `<tr><td colspan="6" class="loading-state" style="color: var(--accent-cancelled)">Error loading products.</td></tr>`;
  }
}

function renderProducts() {
  const container = document.getElementById('products-table-body');
  container.innerHTML = '';

  if (productsData.length === 0) {
    container.innerHTML = `<tr><td colspan="6" class="loading-state">No products in catalog. Click "Add New Product" to start!</td></tr>`;
    return;
  }

  productsData.forEach(p => {
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

// Load dropdown selection options for offers in the form
async function populateOfferDropdown() {
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

async function showProductForm(id = null) {
  const modal = document.getElementById('product-modal');
  const title = document.getElementById('product-modal-title');
  const form = document.getElementById('product-form');

  form.reset();
  await populateOfferDropdown();

  if (id) {
    title.textContent = 'Edit Product Details';
    const p = productsData.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById('product-id').value = p.id;
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-price').value = p.price;
    document.getElementById('product-image').value = p.image_url || '';
    document.getElementById('product-offer').value = p.offer_id || '';
    document.getElementById('product-desc').value = p.description || '';
  } else {
    title.textContent = 'Add New Product';
    document.getElementById('product-id').value = '';
  }

  toggleModal('product-modal', true);
}

window.editProduct = function(id) {
  showProductForm(id);
};

async function handleProductSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('product-id').value;
  const data = {
    name: document.getElementById('product-name').value,
    price: parseFloat(document.getElementById('product-price').value),
    image_url: document.getElementById('product-image').value,
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

window.deleteProduct = async function(id) {
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
};

async function handleLogout() {
  try {
    const res = await fetch('/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      window.location.href = '/login';
    } else {
      alert('Failed to logout. Please try again.');
    }
  } catch (e) {
    console.error('Logout error:', e);
    alert('An error occurred during logout.');
  }
}
