import { initTheme } from './components/theme.js';
import { initNavigation, loadCurrentSection } from './components/navigation.js';
import { initEventListeners } from './components/events.js';

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

// Init Page
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNavigation();
  initEventListeners();
  loadCurrentSection();
});
