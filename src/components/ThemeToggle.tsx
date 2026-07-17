import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

/** Sun/Moon theme toggle — light default, remembers the user's choice. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      className={`inline-flex items-center justify-center h-9 w-9 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors ${className}`}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export default ThemeToggle;
