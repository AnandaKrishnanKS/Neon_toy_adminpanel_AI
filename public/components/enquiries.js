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
        <select class="form-control select-enquiry-status" 
                style="padding: 4px 8px; font-size: 0.85rem; border-radius: 6px; min-width: 110px;"
                data-id="${e.id}">
          <option value="Pending" ${statusText === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="In Progress" ${statusText === 'In Progress' ? 'selected' : ''}>In Progress</option>
          <option value="Completed" ${statusText === 'Completed' ? 'selected' : ''}>Completed</option>
          <option value="Cancelled" ${statusText === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
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
