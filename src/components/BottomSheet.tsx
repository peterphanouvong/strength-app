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
        <div className="fixed inset-0 z-40">
          <motion.button
            aria-label="Close"
            className="absolute inset-0 bg-court-deep/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              hapticTap();
              onClose();
            }}
          />
          <motion.div
            role="dialog"
            aria-label={subtitle ? `${title} · ${subtitle}` : title}
            className="absolute bottom-0 inset-x-0 bg-court border-t border-white/15 rounded-t-3xl px-5 pt-3 pb-8 max-w-xl mx-auto shadow-[0_-16px_48px_rgba(0,0,0,0.35)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
          >
            <div className="w-9 h-1 rounded-full bg-white/25 mx-auto mb-4" />
            <div className="text-center mb-5">
              <h3 className="font-bold text-lg leading-snug tracking-[-0.02em]">{title}</h3>
              {subtitle && (
                <p className="text-[0.8125rem] font-medium text-mist mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
