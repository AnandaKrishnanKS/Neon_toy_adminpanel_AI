import { state } from './state.js';
import { toggleModal, updateUploadPreview } from './utils.js';

export async function loadOffers() {
  const container = document.getElementById('offers-list-grid');
  container.innerHTML = `<div class="loading-state">Loading offers...</div>`;

  try {
    const res = await fetch('/api/offers');
    state.offersData = await res.json();
    renderOffers();
  } catch (e) {
    container.innerHTML = `<div class="loading-state" style="color: var(--accent-cancelled)">Error loading active offers.</div>`;
  }
}

export function renderOffers() {
  const container = document.getElementById('offers-list-grid');
  container.innerHTML = '';

  if (state.offersData.length === 0) {
    container.innerHTML = `<div class="loading-state">No offers configured. Click "Create New Offer" to start!</div>`;
    return;
  }

  state.offersData.forEach(o => {
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

export function showOfferForm(id = null) {
  const modal = document.getElementById('offer-modal');
  const title = document.getElementById('offer-modal-title');
  const form = document.getElementById('offer-form');

  form.reset();

  if (id) {
    title.textContent = 'Edit Offer Details';
    const o = state.offersData.find(offer => offer.id === id);
    if (!o) return;

    document.getElementById('offer-id').value = o.id;
    document.getElementById('offer-title').value = o.title;
    document.getElementById('offer-discount').value = o.discount_percentage;
    document.getElementById('offer-badge').value = o.badge_text || '';
    document.getElementById('offer-desc').value = o.description || '';
    document.getElementById('offer-active').checked = o.is_active;

    // Sync banner preview UI
    updateUploadPreview('offer', o.banner_url || '');
  } else {
    title.textContent = 'Create New Offer';
    document.getElementById('offer-id').value = '';
    document.getElementById('offer-active').checked = true;

    // Clear banner preview UI
    updateUploadPreview('offer', '');
  }

  toggleModal('offer-modal', true);
}

export async function handleOfferSubmit(e) {
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

export async function deleteOffer(id) {
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
}

// Bind to window for HTML click triggers
window.editOffer = showOfferForm;
window.deleteOffer = deleteOffer;
