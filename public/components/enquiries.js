import { state } from './state.js';
import { toggleModal } from './utils.js';

export async function loadEnquiries() {
  const container = document.getElementById('enquiries-table-body');
  container.innerHTML = `<tr><td colspan="8" class="loading-state">Loading enquiries...</td></tr>`;

  try {
    const res = await fetch('/api/enquiries');
    state.enquiriesData = await res.json();
    renderEnquiries(state.enquiriesData);
  } catch (error) {
    console.error('loadEnquiries error:', error);
    container.innerHTML = `<tr><td colspan="8" class="loading-state" style="color: var(--accent-cancelled)">Error loading enquiries.</td></tr>`;
  }
}

export function renderEnquiries(enquiries) {
  const container = document.getElementById('enquiries-table-body');
  container.innerHTML = '';

  const searchInput = document.getElementById('enquiry-search');
  const searchQuery = (searchInput ? searchInput.value : '').toLowerCase().trim();

  let filtered = enquiries;
  if (searchQuery) {
    filtered = enquiries.filter(e => 
      e.name.toLowerCase().includes(searchQuery) ||
      e.user_email.toLowerCase().includes(searchQuery) ||
      e.product_name.toLowerCase().includes(searchQuery) ||
      (e.message && e.message.toLowerCase().includes(searchQuery))
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `<tr><td colspan="8" class="loading-state">No enquiries found.</td></tr>`;
    return;
  }

  filtered.forEach(e => {
    const dateStr = new Date(e.created_at).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const statusText = e.status || 'Pending';
    const tr = document.createElement('tr');
    
    // Create the select dropdown element dynamically
    tr.innerHTML = `
      <td><strong>#ENQ-${e.id}</strong></td>
      <td style="display: flex; align-items: center; gap: 10px;">
        <img src="${e.product_image || 'https://images.unsplash.com/photo-1515488411204-629007f9c2d6?w=100&q=80'}" 
             alt="${e.product_name}" 
             style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; border: 1px solid var(--glass-border);" />
        <div>
          <span style="font-weight: 600; display: block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${e.product_name}</span>
          <span class="status-badge" style="font-size: 0.7rem; padding: 2px 6px; margin-top: 2px; text-transform: uppercase; background: rgba(255, 255, 255, 0.05); color: var(--text-secondary); border: 1px solid var(--glass-border);">${e.product_category}</span>
        </div>
      </td>
      <td>
        <strong>${e.name}</strong><br/>
        <span style="font-size: 0.8rem; color: var(--text-secondary);">${e.user_email}</span>
      </td>
      <td><code>${e.phone || '—'}</code></td>
      <td>
        <button class="details-btn read-message-btn" data-id="${e.id}">💬 Read Message</button>
      </td>
      <td><span style="font-size: 0.85rem; color: var(--text-secondary);">${dateStr}</span></td>
      <td>
        <span class="status-badge ${statusText.toLowerCase().replace(/\s+/g, '-')}" id="badge-enq-${e.id}">${statusText}</span>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <select class="form-control select-enquiry-status" 
                  style="padding: 4px 8px; font-size: 0.85rem; border-radius: 6px; min-width: 110px; margin-bottom: 0;"
                  data-id="${e.id}">
            <option value="Pending" ${statusText === 'Pending' ? 'selected' : ''}>Pending</option>
            <option value="In Progress" ${statusText === 'In Progress' ? 'selected' : ''}>In Progress</option>
            <option value="Completed" ${statusText === 'Completed' ? 'selected' : ''}>Completed</option>
            <option value="Cancelled" ${statusText === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
          <button class="details-btn print-enquiry-btn" data-id="${e.id}" title="Print Invoice/Estimate" style="padding: 6px 10px; font-size: 0.95rem; border-radius: 6px;">🖨️</button>
        </div>
      </td>
    `;
    
    // Add event listener to the status dropdown inside this row
    const select = tr.querySelector('.select-enquiry-status');
    select.addEventListener('change', async (event) => {
      const newStatus = event.target.value;
      const success = await updateEnquiryStatus(e.id, newStatus);
      if (success) {
        // Update the badge visually
        const badge = document.getElementById(`badge-enq-${e.id}`);
        if (badge) {
          badge.textContent = newStatus;
          badge.className = `status-badge ${newStatus.toLowerCase().replace(/\s+/g, '-')}`;
        }
        // Update data in cached state
        const targetEnq = state.enquiriesData.find(x => x.id === e.id);
        if (targetEnq) targetEnq.status = newStatus;
      } else {
        // Revert select value
        select.value = statusText;
      }
    });

    // Add event listener to the print button inside this row
    const printBtn = tr.querySelector('.print-enquiry-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        printEnquiryInvoice(e);
      });
    }
 
    // Add event listener to the read message button inside this row
    const readBtn = tr.querySelector('.read-message-btn');
    readBtn.addEventListener('click', () => {
      showEnquiryMessage(e.message);
    });

    container.appendChild(tr);
  });
}

export async function updateEnquiryStatus(id, status) {
  try {
    const res = await fetch(`/api/enquiries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    if (res.ok) {
      return true;
    } else {
      const err = await res.json();
      alert('Error updating status: ' + (err.error || 'Unknown error'));
      return false;
    }
  } catch (e) {
    console.error('updateEnquiryStatus error:', e);
    alert('Failed to update enquiry status.');
    return false;
  }
}

export function filterEnquiries() {
  renderEnquiries(state.enquiriesData);
}

export function showEnquiryMessage(message) {
  document.getElementById('enquiry-message-full-text').textContent = message;
  toggleModal('enquiry-message-modal', true);
}

export function printEnquiryInvoice(enquiry) {
  const html = generateEnquiryInvoiceHtml(enquiry);

  // Create an iframe to print the invoice quietly
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Wait for the iframe content to load and print
    iframe.contentWindow.focus();
    setTimeout(() => {
      try {
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      } catch (printErr) {
        console.warn('Iframe printing blocked/failed, using fallback:', printErr);
        fallbackPrint(html);
        document.body.removeChild(iframe);
      }
    }, 500);
  } catch (err) {
    console.warn('Writing to iframe failed, using fallback:', err);
    fallbackPrint(html);
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  }
}

function fallbackPrint(html) {
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  } else {
    alert('The print window pop-up was blocked by your browser. Please allow pop-ups for this admin portal.');
  }
}

function generateEnquiryInvoiceHtml(enquiry) {
  const dateStr = new Date(enquiry.created_at).toLocaleString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const priceVal = parseFloat(enquiry.product_price || 0);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Custom Enquiry Estimate - #ENQ-${enquiry.id}</title>
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
          min-height: 120px;
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
          width: 100px;
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
        
        .text-right {
          text-align: right;
        }
        
        .summary-wrapper {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 30px;
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
 
        .enquiry-message-box {
          background-color: #f8fafc;
          border: 1px dashed #cbd5e1;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 30px;
          font-size: 13px;
          color: #475569;
          white-space: pre-wrap;
          line-height: 1.6;
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
            <h1>ToTStore</h1>
            <p>Premium Custom Toy Request Quotation</p>
          </div>
          <div class="invoice-meta">
            <h2>CUSTOM REQUEST ESTIMATE</h2>
            <p><strong>Enquiry Ref:</strong> #ENQ-${enquiry.id}</p>
            <p><strong>Date:</strong> ${dateStr}</p>
          </div>
        </div>
        
        <div class="details-grid">
          <div class="info-section">
            <h3>Customer Info</h3>
            <div class="info-card">
              <p><strong>Name:</strong> ${enquiry.name || '—'}</p>
              <p><strong>Email:</strong> ${enquiry.user_email || '—'}</p>
              <p><strong>Phone:</strong> ${enquiry.phone || '—'}</p>
            </div>
          </div>
          
          <div class="info-section">
            <h3>Request Status</h3>
            <div class="info-card">
              <p><strong>Status:</strong> ${enquiry.status || 'Pending'}</p>
              <p><strong>Type:</strong> Handmade / Custom Toy Design</p>
            </div>
          </div>
        </div>
 
        <div class="info-section" style="margin-bottom: 40px;">
          <h3>Delivery Information</h3>
          <div class="info-card" style="min-height: auto;">
            <p style="margin-bottom: 6px;"><strong>Address:</strong> ${enquiry.address || '—'}${enquiry.landmark ? `, ${enquiry.landmark}` : ''}</p>
            <p style="margin-bottom: 6px;"><strong>Location:</strong> ${[enquiry.city, enquiry.district, enquiry.state].filter(Boolean).join(', ') || '—'}</p>
            <p style="margin-bottom: 6px;"><strong>Pincode:</strong> ${enquiry.pincode || '—'}</p>
          </div>
        </div>
        
        <h3>Toy Specifications</h3>
        <table style="margin-top: 10px;">
          <thead>
            <tr>
              <th>Base Toy Product</th>
              <th>Category</th>
              <th class="text-right">Estimated Base Price</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div class="item-name">${enquiry.product_name}</div>
              </td>
              <td>${enquiry.product_category || 'Handmade'}</td>
              <td class="text-right">₹${priceVal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="summary-wrapper">
          <table class="summary-table">
            <tr class="total-row">
              <td>Total Estimated:</td>
              <td class="text-right">₹${priceVal.toFixed(2)}</td>
            </tr>
          </table>
        </div>
 
        <h3>Customization Details & Instructions</h3>
        <div class="enquiry-message-box">
          ${enquiry.message || 'No specific instructions provided.'}
        </div>
        
        <div class="footer">
          <p>Thank you for choosing TOT store!</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
