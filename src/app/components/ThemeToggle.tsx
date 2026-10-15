'use client';

import { motion, AnimatePresence } from 'motion/react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LandingTheme = 'light' | 'dark';

/* ── VaultVerify theme toggle ─────────────────────────────────
   Animated Sun ↔ Moon icon state transition, built with the same
   locked motion language as the mobile Menu ↔ X toggle:
   rotate/fade swap via AnimatePresence + spring tap feedback.
   Light is the default; dark is the premium midnight look. ── */
export default function ThemeToggle({
  theme,
  onToggle,
  className,
}: {
  theme: LandingTheme;
  onToggle: () => void;
  className?: string;
}) {
  const isDark = theme === 'dark';
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Light mode' : 'Dark mode'}
      whileTap={{ scale: 0.92 }}
      className={cn(
        'rounded-lg border border-vault-border bg-white/80 p-2 text-jade-ink shadow-sm backdrop-blur-md',
        'transition-colors hover:border-verify-green/60 hover:text-verify-ink',
        'dark:border-jade-mist/60 dark:bg-vault-dark/60 dark:text-pearl dark:shadow-none',
        'dark:hover:border-verify-green/60 dark:hover:text-verify-mint',
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: 90, opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="block"
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
