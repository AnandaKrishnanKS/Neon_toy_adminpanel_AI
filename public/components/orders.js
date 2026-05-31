import { state } from './state.js';
import { toggleModal } from './utils.js';

export async function loadOrders() {
  const container = document.getElementById('orders-table-body');
  container.innerHTML = `<tr><td colspan="7" class="loading-state">Loading orders...</td></tr>`;

  try {
    const res = await fetch('/api/orders');
    state.ordersData = await res.json();
    const activeFilter = document.querySelector('.tab-btn.active').getAttribute('data-filter');
    renderOrders(activeFilter);
  } catch (error) {
    console.error('loadOrders error:', error);
    container.innerHTML = `<tr><td colspan="8" class="loading-state" style="color: var(--accent-cancelled)">Error loading orders.</td></tr>`;
  }
}

export function renderOrders(filter) {
  const container = document.getElementById('orders-table-body');
  container.innerHTML = '';

  const filtered = filter === 'All' 
    ? state.ordersData 
    : state.ordersData.filter(o => o.status === filter);

  if (filtered.length === 0) {
    container.innerHTML = `<tr><td colspan="8" class="loading-state">No orders found.</td></tr>`;
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

    // Extract payment method and determine status (Paid vs COD)
    let isPaid = false;
    try {
      const shippingObj = typeof o.shipping_details === 'string' ? JSON.parse(o.shipping_details) : o.shipping_details;
      const pm = (shippingObj.payment_method || 'COD').toUpperCase();
      if (pm === 'RAZORPAY' || pm === 'CARD' || pm === 'EWALLET' || pm === 'PAID') {
        isPaid = true;
      }
    } catch (e) {
      isPaid = false;
    }
    const paymentDisplay = isPaid 
      ? `<span class="pay-badge paid">Paid</span>` 
      : `<span class="pay-badge cod">COD</span>`;

    const statusText = o.status || 'Pending';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#NT-${o.id}</strong></td>
      <td>${o.user_email}</td>
      <td>${itemCount} toy item(s)</td>
      <td><strong>₹${parseFloat(o.total_amount || 0).toFixed(2)}</strong></td>
      <td>${paymentDisplay}</td>
      <td>${dateStr}</td>
      <td><span class="status-badge ${statusText.toLowerCase()}">${statusText}</span></td>
      <td>
        <button class="details-btn" onclick="viewOrderDetails(${o.id})">👁️ View Details</button>
      </td>
    `;
    container.appendChild(tr);
  });
}

export function viewOrderDetails(id) {
  const order = state.ordersData.find(o => o.id === id);
  if (!order) return;

  document.getElementById('od-id').textContent = order.id;
  document.getElementById('od-date').textContent = new Date(order.created_at).toLocaleString('en-IN');
  document.getElementById('od-total').textContent = `₹${parseFloat(order.total_amount).toFixed(2)}`;

  // Determine if it is a Paid order
  let isPaid = false;
  try {
    const shippingObj = typeof order.shipping_details === 'string' ? JSON.parse(order.shipping_details) : order.shipping_details;
    const pm = (shippingObj.payment_method || 'COD').toUpperCase();
    if (pm === 'RAZORPAY' || pm === 'CARD' || pm === 'EWALLET' || pm === 'PAID') {
      isPaid = true;
    }
  } catch (e) {
    isPaid = false;
  }

  // Populate options dynamically
  const select = document.getElementById('od-status-select');
  select.innerHTML = `
    <option value="Pending">Pending</option>
    <option value="Processing">Processing</option>
    <option value="Shipped">Shipped</option>
    <option value="Delivered">Delivered</option>
    <option value="Cancelled">Cancelled</option>
  `;
  if (isPaid || order.status === 'Refunded') {
    select.innerHTML += `<option value="Refunded">Refunded</option>`;
  }

  select.value = order.status;

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
}

export async function handleOrderStatusSubmit() {
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

// Bind to window for HTML click triggers
window.viewOrderDetails = viewOrderDetails;
