// Initialize theme on document element load to prevent flash of unstyled content
(function () {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

// Toggle theme between light and dark modes
function toggleTheme() {
  const current = localStorage.getItem('theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}
