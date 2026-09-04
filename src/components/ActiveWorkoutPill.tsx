import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { TRAINING_PLAN } from '../data';
import { cn } from '../lib/utils';
import { useActiveSession } from '../lib/session';
import { hapticTap } from '../lib/feedback';
import { formatElapsed } from '../pages/WorkoutPage';
import { isTabBarRoute } from './TabBar';

export function ActiveWorkoutPill() {
  const { session, elapsed } = useActiveSession();
  const location = useLocation();
  const navigate = useNavigate();

  let title: string | null = null;
  if (session) {
    for (const week of TRAINING_PLAN) {
      const found = week.days.find((d) => d.id === session.dayId);
      if (found) {
        title = found.title.split(': ')[1] || found.title;
        break;
      }
    }
  }

  const hidden =
    !session ||
    !title ||
    location.pathname === `/workout/${session.dayId}` ||
    location.pathname.startsWith('/complete/') ||
    location.pathname.startsWith('/congrats/');

  // Stack above the tab bar (and above a preview page's Start CTA) instead of
  // overlapping the bottom controls; bottom-4 elsewhere.
  const lifted = isTabBarRoute(location.pathname) || location.pathname.startsWith('/workout/');

  return (
    <AnimatePresence>
      {!hidden && session && (
        <motion.div
          className={cn(
            'fixed inset-x-4 z-30 flex justify-center pointer-events-none',
            lifted ? 'bottom-[5.5rem]' : 'bottom-4'
          )}
          initial={{ y: 70, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 70, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        >
          <button
            onClick={() => {
              hapticTap();
              navigate(`/workout/${session.dayId}`);
            }}
            className="pointer-events-auto flex items-center gap-2.5 bg-mint text-court-deep font-bold text-sm pl-4 pr-5 py-3 rounded-full shadow-xl transition-transform active:scale-95"
          >
            <span className="relative flex w-2.5 h-2.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-court-deep/40 animate-ping" />
              <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-court-deep" />
            </span>
            {title} · <span className="tabular-nums">{formatElapsed(elapsed)}</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
