function storedTheme(): string | null {
  try {
    return localStorage.getItem('tinydiff-theme');
  } catch {
    return null;
  }
}

const stored = storedTheme();
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

if (stored === 'dark' || (stored === null && prefersDark)) {
  document.documentElement.classList.add('dark');
}
