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

  const searchInput = document.getElementById('order-search');
  const searchQuery = (searchInput ? searchInput.value : '').toLowerCase().trim();

  let filtered = filter === 'All' 
    ? state.ordersData 
    : state.ordersData.filter(o => o.status === filter);

  if (searchQuery) {
    filtered = filtered.filter(o => o.user_email && o.user_email.toLowerCase().includes(searchQuery));
  }

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

  const statusChangeWrapper = document.getElementById('od-status-change-wrapper');
  const saveBtn = document.getElementById('save-order-status-btn');
  const refundBtn = document.getElementById('refund-order-btn');

  if (isPaid && order.status === 'Cancelled') {
    statusChangeWrapper.style.display = 'none';
    saveBtn.style.display = 'none';
    refundBtn.style.display = '';
    refundBtn.setAttribute('data-id', order.id);
  } else {
    statusChangeWrapper.style.display = '';
    saveBtn.style.display = '';
    refundBtn.style.display = 'none';
  }

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

  // Track the current active order ID on the save and print buttons
  document.getElementById('save-order-status-btn').setAttribute('data-id', order.id);
  const printBtn = document.getElementById('print-invoice-btn');
  if (printBtn) {
    printBtn.setAttribute('data-id', order.id);
  }

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

export async function handleOrderRefund() {
  const id = this.getAttribute('data-id');
  if (!confirm('Are you sure you want to refund this order?')) return;

  try {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Refunded' })
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
export function filterOrders() {
  const activeTab = document.querySelector('.tab-btn.active');
  const activeFilter = activeTab ? activeTab.getAttribute('data-filter') : 'All';
  renderOrders(activeFilter);
}

function generateInvoiceHtml(order) {
  let shipping = {};
  try {
    shipping = typeof order.shipping_details === 'string' 
      ? JSON.parse(order.shipping_details) 
      : order.shipping_details;
  } catch (e) {
    shipping = {};
  }

  let items = [];
  try {
    items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
  } catch (e) {
    items = [];
  }

  const dateStr = new Date(order.created_at).toLocaleString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const totalVal = parseFloat(order.total_amount || 0);

  // Compute subtotal from items
  const subtotalVal = items.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0);

  const itemsHtml = items.map(item => {
    const price = parseFloat(item.price || 0);
    const itemTotal = price * item.quantity;
    return `
      <tr>
        <td>
          <div class="item-name">${item.name}</div>
        </td>
        <td>₹${price.toFixed(2)}</td>
        <td class="text-center">${item.quantity}</td>
        <td class="text-right">₹${itemTotal.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Invoice - #NT-${order.id}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Inter', sans-serif;
          color: #1e293b;
          background-color: #ffffff;
          padding: 40px;
          line-height: 1.5;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .invoice-wrapper {
          max-width: 800px;
          margin: 0 auto;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
        }
        
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #f1f5f9;
          padding-bottom: 25px;
          margin-bottom: 30px;
        }
        
        .logo-area h1 {
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, #ff3366, #00d2ff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 5px;
        }
        
        .logo-area p {
          font-size: 13px;
          color: #64748b;
          font-weight: 500;
        }
        
        .invoice-meta {
          text-align: right;
        }
        
        .invoice-meta h2 {
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 5px;
        }
        
        .invoice-meta p {
          font-size: 13px;
          color: #64748b;
        }
        
        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin-bottom: 40px;
        }
        
        .info-section h3 {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #94a3b8;
          margin-bottom: 12px;
          font-weight: 700;
        }
        
        .info-card {
          background-color: #f8fafc;
          border-radius: 12px;
          padding: 20px;
          border: 1px solid #f1f5f9;
        }
        
        .info-card p {
          font-size: 14px;
          color: #334155;
          margin-bottom: 8px;
        }
        
        .info-card p:last-child {
          margin-bottom: 0;
        }
        
        .info-card p strong {
          color: #64748b;
          font-weight: 500;
          display: inline-block;
          width: 130px;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        
        th {
          background-color: #f8fafc;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748b;
          text-align: left;
          padding: 12px 16px;
          border-bottom: 2px solid #e2e8f0;
        }
        
        td {
          padding: 16px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 14px;
          color: #334155;
        }
        
        .item-name {
          font-weight: 600;
          color: #0f172a;
        }
        
        .text-center {
          text-align: center;
        }
        
        .text-right {
          text-align: right;
        }
        
        .summary-wrapper {
          display: flex;
          justify-content: flex-end;
        }
        
        .summary-table {
          width: 320px;
          margin-bottom: 0;
        }
        
        .summary-table td {
          padding: 8px 16px;
          border: none;
        }
        
        .summary-table tr.total-row td {
          border-top: 2px solid #e2e8f0;
          font-size: 18px;
          font-weight: 800;
          color: #0f172a;
          padding-top: 12px;
        }
        
        .footer {
          text-align: center;
          margin-top: 50px;
          padding-top: 25px;
          border-top: 2px solid #f1f5f9;
        }
        
        .footer p {
          font-size: 13px;
          color: #94a3b8;
        }
        
        @media print {
          body {
            padding: 0;
          }
          .invoice-wrapper {
            border: none;
            box-shadow: none;
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      <div class="invoice-wrapper">
        <div class="header">
          <div class="logo-area">
            <h1>ToTToys</h1>
            <p>Premium Toy Management Portal</p>
          </div>
          <div class="invoice-meta">
            <h2>INVOICE</h2>
            <p><strong>Order ID:</strong> #NT-${order.id}</p>
            <p><strong>Date:</strong> ${dateStr}</p>
          </div>
        </div>
        
        <div class="details-grid">
          <div class="info-section">
            <h3>Customer & Shipping Details</h3>
            <div class="info-card">
              <p><strong>Name:</strong> ${shipping.name || '—'}</p>
              <p><strong>Phone:</strong> ${shipping.phone || '—'}</p>
              <p><strong>Address:</strong> ${shipping.address || '—'}</p>
              <p><strong>City:</strong> ${shipping.city || '—'}</p>
              <p><strong>Zipcode:</strong> ${shipping.zipcode || '—'}</p>
            </div>
          </div>
          
          <div class="info-section">
            <h3>Payment & Status</h3>
            <div class="info-card">
              <p><strong>Payment Method:</strong> ${shipping.payment_method || 'COD'}</p>
              <p><strong>Order Status:</strong> ${order.status || 'Pending'}</p>
            </div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Unit Price</th>
              <th class="text-center">Qty</th>
              <th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div class="summary-wrapper">
          <table class="summary-table">
            <tr>
              <td>Subtotal:</td>
              <td class="text-right">₹${subtotalVal.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td>Total Amount:</td>
              <td class="text-right">₹${totalVal.toFixed(2)}</td>
            </tr>
          </table>
        </div>
        
        <div class="footer">
          <p>Thank you for shopping at ToTToys!</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function handlePrintInvoice() {
  const id = this.getAttribute('data-id');
  const order = state.ordersData.find(o => String(o.id) === String(id));
  if (!order) return;

  const html = generateInvoiceHtml(order);

  // Create an iframe to print the invoice quietly
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  // Wait for the iframe content to load and print
  iframe.contentWindow.focus();
  setTimeout(() => {
    iframe.contentWindow.print();
    // Remove the iframe after a short delay
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  }, 500);
}

// Bind to window for HTML click triggers
window.viewOrderDetails = viewOrderDetails;
