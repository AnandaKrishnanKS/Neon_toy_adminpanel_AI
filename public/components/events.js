import { loadCurrentSection } from './navigation.js';
import { filterUsers } from './users.js';
import { renderOrders, handleOrderStatusSubmit, handleOrderRefund, filterOrders, handlePrintInvoice } from './orders.js';
import { toggleModal, setupImageUpload } from './utils.js';
import { setTheme } from './theme.js';
import { showProductForm, handleProductSubmit, filterProducts } from './products.js';
import { showOfferForm, handleOfferSubmit } from './offers.js';

export function initEventListeners() {
  // Initialize Cloudinary Dropzones
  setupImageUpload('product');
  setupImageUpload('offer');

  // Global Refresh button — with visual loading feedback
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.addEventListener('click', async () => {
    if (refreshBtn.disabled) return;

    // Enter loading state
    refreshBtn.disabled = true;
    refreshBtn.dataset.original = refreshBtn.innerHTML;
    refreshBtn.innerHTML = '<span class="refresh-spinner"></span> Refreshing...';
    refreshBtn.classList.add('refreshing');

    try {
      await loadCurrentSection();
    } finally {
      // Restore button after a short delay so the user sees the feedback
      setTimeout(() => {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = refreshBtn.dataset.original;
        refreshBtn.classList.remove('refreshing');
      }, 600);
    }
  });

  // Users Section Search
  document.getElementById('user-search').addEventListener('input', filterUsers);

  // Products Section Search
  document.getElementById('product-search').addEventListener('input', filterProducts);

  // Orders Section Search
  document.getElementById('order-search').addEventListener('input', filterOrders);

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

  // Settings Modal triggers
  document.getElementById('settings-btn').onclick = () => toggleModal('settings-modal', true);
  document.getElementById('close-settings-modal').onclick = () => toggleModal('settings-modal', false);

  // Theme Options Click Listeners
  document.querySelectorAll('.theme-select-btn').forEach(btn => {
    btn.onclick = () => setTheme(btn.getAttribute('data-theme'));
  });

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
  document.getElementById('refund-order-btn').onclick = handleOrderRefund;
  const printInvoiceBtn = document.getElementById('print-invoice-btn');
  if (printInvoiceBtn) {
    printInvoiceBtn.onclick = handlePrintInvoice;
  }

  // Logout Button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Mobile Sidebar Toggle listener
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('mobile-open');
    };
  }

  // Click outside sidebar to close it on mobile
  document.addEventListener('click', (e) => {
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      if (!sidebar.contains(e.target) && e.target !== toggleBtn) {
        sidebar.classList.remove('mobile-open');
      }
    }
  });
}

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
