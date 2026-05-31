export async function loadDashboard() {
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
      container.innerHTML = `<tr><td colspan="6" class="loading-state">No orders placed yet.</td></tr>`;
      return;
    }

    recentOrders.forEach(o => {
      const dateStr = new Date(o.created_at).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      });

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
        <td>₹${parseFloat(o.total_amount || 0).toFixed(2)}</td>
        <td>${paymentDisplay}</td>
        <td><span class="status-badge ${statusText.toLowerCase()}">${statusText}</span></td>
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
