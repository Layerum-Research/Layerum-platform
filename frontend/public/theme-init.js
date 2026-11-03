(() => {
  try {
    var KEY = 'layerum:theme';
    var stored = window.localStorage.getItem(KEY);
    var theme = stored === 'light' || stored === 'dark' ? stored : null;
    if (!theme) {
      theme =
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
    }
    document.documentElement.setAttribute('data-app-theme', theme);
    document.documentElement.setAttribute('data-public-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();
