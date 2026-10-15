import { useStore } from '../store/useStore';

export function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const dark = theme === 'dark';

  return (
    <button
      className={`theme-toggle ${dark ? 'dark' : 'light'}`}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      <span className="theme-toggle-track">
        <span className="theme-toggle-stars">
          <span /><span /><span />
        </span>
        <span className="theme-toggle-thumb">
          <svg className="icon-sun" viewBox="0 0 24 24" width="13" height="13" fill="none">
            <circle cx="12" cy="12" r="5" fill="currentColor" />
            <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
            </g>
          </svg>
          <svg className="icon-moon" viewBox="0 0 24 24" width="13" height="13" fill="none">
            <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" fill="currentColor" />
          </svg>
        </span>
      </span>
    </button>
  );
}
