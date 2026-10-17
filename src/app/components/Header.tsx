'use client';

import React, { useState } from 'react';
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useScroll,
  useMotionValueEvent,
  type Variants,
} from 'framer-motion';
import { Menu, X, ArrowRight } from 'lucide-react';
import { VaultMark } from '@/components/bts/brand';
import ThemeToggle, { type LandingTheme } from '@/app/components/ThemeToggle';
import { cn } from '@/lib/utils';

/* ── VaultVerify locked motion language ────────────────────────
   fixed floating navbar · spring hover links · glowing dynamic
   border · expandable mobile drawer (layout state transitions)
   ──────────────────────────────────────────────────────────── */
const SPRING = { type: 'spring' as const, stiffness: 400, damping: 15 };
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type Role = 'candidate' | 'recruiter' | 'checklist';

/* animated underline pill — spring triggers on link hover */
const underline: Variants = {
  initial: { scaleX: 0 },
  hover: { scaleX: 1 },
};

/* staggered reveal for the expandable mobile drawer */
const drawerParent: Variants = {
  closed: {},
  open: { transition: { staggerChildren: 0.045, delayChildren: 0.1 } },
};

const drawerItem: Variants = {
  closed: { opacity: 0, y: -8 },
  open: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } },
};

export default function Header({
  onRole,
  theme = 'light',
  onToggleTheme,
}: {
  onRole?: (r: Role) => void;
  theme?: LandingTheme;
  onToggleTheme?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 24));

  const go = (r: Role) => {
    if (onRole) return onRole(r);
    /* standalone fallback — deep-link the public portal views */
    window.location.assign(r === 'recruiter' ? '/?view=recruiter' : '/?view=checklist');
  };

  const navLinks = [
    { name: 'Solutions', href: '#features' },
    { name: 'How it works', href: '#flow' },
    { name: 'Trust & security', href: '#trust' },
  ];

  const productLinks: Array<{ name: string; role: Role; accent?: boolean }> = [
    { name: 'References', role: 'candidate' },
    { name: 'Skills checklist', role: 'checklist', accent: true },
  ];

  return (
    <motion.header
      initial={reduce ? false : { y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="fixed inset-x-0 top-0 z-50"
    >
      {/* floating glass backdrop — transparent over the hero, glass on scroll
          (background blur values per the aidefinitive enterprise pattern) */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 border-b transition-all duration-500',
          scrolled
            ? 'border-vault-border bg-white/80 shadow-[0_10px_36px_-18px_rgba(14,47,52,0.28)] backdrop-blur-xl dark:border-jade-mist/60 dark:bg-vault-dark/75 dark:shadow-[0_12px_40px_-20px_rgba(0,0,0,0.7)]'
            : 'border-transparent bg-transparent'
        )}
      />

      {/* glowing Verify Bright Green dynamic border line underneath */}
      <motion.div
        aria-hidden
        animate={{ opacity: scrolled ? 1 : 0, scaleX: scrolled ? 1 : 0.2 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="absolute inset-x-0 bottom-0 h-px origin-center bg-gradient-to-r from-transparent via-verify-green to-transparent"
      />
      <motion.div
        aria-hidden
        animate={{ opacity: scrolled ? 0.45 : 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="absolute inset-x-0 bottom-0 h-[3px] bg-verify-green/40 blur-[3px]"
      />

      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Brand — interactive logo hover highlight (primary colors) */}
        <motion.a
          href="#top"
          onClick={() => setIsOpen(false)}
          className="group flex items-center gap-2.5"
          whileHover={reduce ? undefined : { scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={SPRING}
        >
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-vault-border bg-white shadow-sm transition-colors duration-300 group-hover:border-verify-green/70 dark:border-jade-mist dark:bg-vault-teal dark:shadow-none">
            <VaultMark size={24} />
            <div className="absolute inset-0 rounded-full bg-verify-green/15 opacity-0 blur-sm transition-opacity duration-300 group-hover:opacity-100" />
          </div>
          <span className="hidden text-lg font-bold tracking-tight text-jade-ink sm:inline dark:text-pearl">
            Vault<span className="text-verify-green">Verify</span>
          </span>
        </motion.a>

        {/* Desktop navigation — spring hover triggers */}
        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <motion.a
              key={link.name}
              href={link.href}
              className="relative py-1 text-sm font-medium text-jade-muted transition-colors hover:text-jade-ink dark:text-fog dark:hover:text-pearl"
              whileHover="hover"
              initial="initial"
            >
              {link.name}
              <motion.span
                className="absolute bottom-0 left-0 right-0 h-[2px] origin-left bg-verify-green"
                variants={underline}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              />
            </motion.a>
          ))}
          {productLinks.map((link) => (
            <motion.button
              key={link.name}
              type="button"
              onClick={() => go(link.role)}
              className={cn(
                'relative py-1 text-sm font-medium transition-colors',
                link.accent
                  ? 'text-verify-ink hover:text-verify-green dark:text-verify-mint'
                  : 'text-jade-muted hover:text-jade-ink dark:text-fog dark:hover:text-pearl'
              )}
              whileHover="hover"
              initial="initial"
            >
              {link.name}
              <motion.span
                className="absolute bottom-0 left-0 right-0 h-[2px] origin-left bg-verify-green"
                variants={underline}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              />
            </motion.button>
          ))}
        </nav>

        {/* Action buttons */}
        <div className="hidden items-center gap-3 md:flex">
          {onToggleTheme && <ThemeToggle theme={theme} onToggle={onToggleTheme} />}
          <button
            type="button"
            onClick={() => go('recruiter')}
            className="rounded-lg px-3 py-2 text-sm font-medium text-jade-muted transition-colors hover:text-jade-ink dark:text-fog dark:hover:text-pearl"
          >
            Sign In
          </button>
          <motion.button
            type="button"
            onClick={() => go('checklist')}
            whileHover={
              reduce
                ? undefined
                : { scale: 1.03, boxShadow: '0 0 15px rgba(124, 193, 24, 0.3)', transition: SPRING }
            }
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 rounded-full bg-verify-green px-4 py-2 text-sm font-semibold text-vault-teal-deep shadow-[0_2px_12px_-2px_rgba(124,193,24,0.5)] outline-none transition-colors hover:bg-verify-mint focus-visible:ring-2 focus-visible:ring-verify-green/60"
          >
            Launch System
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        </div>

        {/* Mobile actions — theme toggle + animated menu icon */}
        <div className="flex items-center gap-2 md:hidden">
          {onToggleTheme && <ThemeToggle theme={theme} onToggle={onToggleTheme} />}
          <motion.button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle navigation"
            aria-expanded={isOpen}
            whileTap={{ scale: 0.92 }}
            className="rounded-lg border border-vault-border bg-white/80 p-2 text-jade-ink shadow-sm focus:outline-none dark:border-jade-mist/60 dark:bg-vault-dark/60 dark:text-pearl dark:shadow-none"
          >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={isOpen ? 'x' : 'menu'}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="block"
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </motion.span>
          </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* Mobile drawer — smooth height layout transition + staggered links */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden md:hidden"
          >
            <motion.div
              variants={drawerParent}
              initial="closed"
              animate="open"
              exit="closed"
              className="mx-4 mb-4 mt-3 rounded-2xl border border-vault-border bg-white/95 p-2 shadow-[0_24px_60px_-24px_rgba(14,47,52,0.35)] backdrop-blur-xl dark:border-jade-mist/60 dark:bg-night/95 dark:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.75)]"
            >
              <div className="flex flex-col gap-1 px-2 py-2">
                {navLinks.map((link) => (
                  <motion.a
                    key={link.name}
                    variants={drawerItem}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-base text-jade-muted transition-colors hover:bg-verify-green/[0.07] hover:text-verify-ink dark:text-fog dark:hover:text-verify-mint"
                  >
                    {link.name}
                  </motion.a>
                ))}
                {productLinks.map((link) => (
                  <motion.button
                    key={link.name}
                    variants={drawerItem}
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      go(link.role);
                    }}
                    className={cn(
                      'rounded-lg px-3 py-2.5 text-left text-base transition-colors hover:bg-verify-green/[0.07]',
                      link.accent
                        ? 'text-verify-ink hover:text-verify-green dark:text-verify-mint'
                        : 'text-jade-muted hover:text-verify-ink dark:text-fog dark:hover:text-verify-mint'
                    )}
                  >
                    {link.name}
                  </motion.button>
                ))}
                <motion.div variants={drawerItem} className="my-2 h-px bg-vault-border dark:bg-jade-mist/50" />
                <motion.button
                  variants={drawerItem}
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    go('recruiter');
                  }}
                  className="rounded-lg px-3 py-2.5 text-left text-base text-jade-muted transition-colors hover:text-jade-ink dark:text-fog dark:hover:text-pearl"
                >
                  Sign In
                </motion.button>
                <motion.button
                  variants={drawerItem}
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    go('checklist');
                  }}
                  className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl bg-verify-green py-2.5 text-sm font-semibold text-vault-teal-deep transition-colors hover:bg-verify-mint"
                >
                  Launch System
                  <ArrowRight className="h-4 w-4" />
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
