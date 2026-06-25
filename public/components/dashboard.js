export async function loadDashboard() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();

    document.getElementById('stat-revenue').textContent = `₹${stats.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('stat-users').textContent = stats.users;
    document.getElementById('stat-orders').textContent = stats.orders;
    document.getElementById('stat-offers').textContent = stats.offers;
    document.getElementById('stat-products').textContent = stats.products;

    const statEnquiries = document.getElementById('stat-enquiries');
    if (statEnquiries) {
      statEnquiries.textContent = stats.enquiries || 0;
    }

    // Fetch and render the 5 most recent orders
    const ordersRes = await fetch('/api/orders');
    const allOrders = await ordersRes.json();
    const recentOrders = allOrders.slice(0, 5);

    const container = document.getElementById('recent-orders-list');
    container.innerHTML = '';

    if (recentOrders.length === 0) {
      container.innerHTML = `<tr><td colspan="6" class="loading-state">No orders placed yet.</td></tr>`;
    } else {
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
    }

    // Fetch and render the 5 most recent custom requests
    const enquiriesRes = await fetch('/api/enquiries');
    const allEnquiries = await enquiriesRes.json();
    const recentEnquiries = allEnquiries.slice(0, 5);

    const enquiriesContainer = document.getElementById('recent-enquiries-list');
    if (enquiriesContainer) {
      enquiriesContainer.innerHTML = '';
      if (recentEnquiries.length === 0) {
        enquiriesContainer.innerHTML = `<tr><td colspan="5" class="loading-state">No custom requests placed yet.</td></tr>`;
      } else {
        recentEnquiries.forEach(e => {
          const dateStr = new Date(e.created_at).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric'
          });
          const statusText = e.status || 'Pending';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>#ENQ-${e.id}</strong></td>
            <td>
              <span style="font-weight: 600; display: block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${e.product_name}</span>
            </td>
            <td>
              <strong>${e.name}</strong><br/>
              <span style="font-size: 0.75rem; color: var(--text-secondary);">${e.user_email}</span>
            </td>
            <td><span class="status-badge ${statusText.toLowerCase().replace(/\s+/g, '-')}">${statusText}</span></td>
            <td>${dateStr}</td>
          `;
          enquiriesContainer.appendChild(tr);
        });
      }
    }

    document.getElementById('goto-orders-link').onclick = () => {
      document.querySelector('.menu-item[data-target="orders"]').click();
    };

    const gotoEnquiriesLink = document.getElementById('goto-enquiries-link');
    if (gotoEnquiriesLink) {
      gotoEnquiriesLink.onclick = () => {
        document.querySelector('.menu-item[data-target="enquiries"]').click();
      };
    }

  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }
}
