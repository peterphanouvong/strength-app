import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { hapticTap } from '../lib/feedback';

export const BottomSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, children }) => {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          {/* pointer-events-none on the wrapper + pointerEvents driven via motion values:
              AnimatePresence keeps this subtree mounted (with frozen props) during the
              exit animation, so interactivity must be cut via `exit`, which motion
              applies instantly when the sheet starts closing. Otherwise the full-screen
              backdrop keeps swallowing taps — and re-firing onClose — for the ~300ms exit. */}
          <motion.button
            aria-label="Close"
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, pointerEvents: 'auto' }}
            exit={{ opacity: 0, pointerEvents: 'none' }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              hapticTap();
              onClose();
            }}
          />
          <motion.div
            role="dialog"
            aria-label={subtitle ? `${title} · ${subtitle}` : title}
            className="absolute bottom-0 inset-x-0 bg-surface border-t border-ink/15 rounded-t-3xl px-5 pt-3 pb-8 max-w-xl mx-auto shadow-[0_-16px_48px_rgba(0,0,0,0.35)]"
            initial={{ y: '100%' }}
            animate={{ y: 0, pointerEvents: 'auto' }}
            exit={{ y: '100%', pointerEvents: 'none' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
          >
            <div className="w-9 h-1 rounded-full bg-ink/25 mx-auto mb-4" />
            <div className="text-center mb-5">
              <h3 className="font-bold text-lg leading-snug tracking-[-0.02em]">{title}</h3>
              {subtitle && (
                <p className="text-[0.8125rem] font-medium text-secondary mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
