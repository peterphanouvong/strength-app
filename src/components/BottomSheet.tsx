import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

export const BottomSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, children }) => {
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
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-label={title}
            className="absolute bottom-0 inset-x-0 bg-court border-t border-white/15 rounded-t-3xl px-5 pt-3 pb-8 max-w-xl mx-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
          >
            <div className="w-10 h-1 rounded-full bg-white/25 mx-auto mb-4" />
            <h3 className="text-center font-bold text-lg tracking-[-0.02em] mb-4">{title}</h3>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
