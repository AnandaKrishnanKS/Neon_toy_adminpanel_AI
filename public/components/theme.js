export function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  setTheme(savedTheme);
}

export function setTheme(theme) {
  // Remove all theme classes
  document.body.classList.remove('light-theme', 'grey-theme');
  
  // Add selected theme class
  if (theme === 'light') {
    document.body.classList.add('light-theme');
  } else if (theme === 'grey') {
    document.body.classList.add('grey-theme');
  }
  
  // Save preference
  localStorage.setItem('theme', theme);
  
  // Update button active state
  document.querySelectorAll('.theme-select-btn').forEach(btn => {
    if (btn.getAttribute('data-theme') === theme) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}
