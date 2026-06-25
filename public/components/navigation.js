import { state } from './state.js';
import { loadDashboard } from './dashboard.js';
import { loadUsers } from './users.js';
import { loadOrders } from './orders.js';
import { loadOffers } from './offers.js';
import { loadProducts } from './products.js';
import { loadTerms } from './terms.js';
import { loadEnquiries } from './enquiries.js';

export function initNavigation() {
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
        'enquiries': 'Handmade & Custom Enquiries',
        'offers': 'Active Deals & Coupons',
        'products': 'Store Inventory Products',
        'terms': 'Terms & Conditions'
      };
      document.getElementById('section-title').textContent = titleMap[target] || 'ToTStore Console';

      state.currentSection = target;
      window.location.hash = target;

      // Close mobile sidebar drawer if open
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.classList.remove('mobile-open');

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

export async function loadCurrentSection() {
  switch (state.currentSection) {
    case 'dashboard':
      return loadDashboard();
    case 'users':
      return loadUsers();
    case 'orders':
      return loadOrders();
    case 'enquiries':
      return loadEnquiries();
    case 'offers':
      return loadOffers();
    case 'products':
      return loadProducts();
    case 'terms':
      return loadTerms();
  }
}
