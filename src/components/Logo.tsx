import { useTheme } from '@/contexts/ThemeContext';
import inkWordmark from '@/assets/brightly-wordmark-ink.png';
import creamWordmark from '@/assets/brightly-wordmark-cream.png';

type Variant = 'auto' | 'ink' | 'cream';

/**
 * Brightly wordmark logo.
 * - variant="auto" (default): follows the theme — ink on light, cream on dark.
 * - variant="cream": force the light-cream wordmark (for hardcoded dark surfaces).
 * - variant="ink": force the dark wordmark (for light surfaces).
 */
export function Logo({ variant = 'auto', className = 'h-10 w-auto' }: { variant?: Variant; className?: string }) {
  const { theme } = useTheme();
  const src =
    variant === 'cream' ? creamWordmark :
    variant === 'ink' ? inkWordmark :
    theme === 'dark' ? creamWordmark : inkWordmark;
  return <img src={src} alt="Brightly" className={className} />;
}

export default Logo;
