import React, { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  hapticTap,
  notificationsSupported,
  notificationPermission,
  requestNotifications,
} from '../lib/feedback';
import { useEntranceOnce } from '../lib/animation';

export default function ProfilePage() {
  const reduceMotion = useReducedMotion();
  const entered = useEntranceOnce('profile');
  const [notifPerm, setNotifPerm] = useState(notificationPermission());

  const rise = (delay: number) => ({
    initial: reduceMotion || !entered ? false : ({ opacity: 0, y: 16 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay, ease: 'easeOut' as const },
  });

  return (
    <div className="min-h-screen">
      <main className="max-w-xl mx-auto px-5 pt-10 pb-32">
        <motion.header className="mb-8" {...rise(0)}>
          <p className="text-sm font-bold text-zest mb-3">Volleyball Strength</p>
          <h1 className="text-[3.25rem] leading-[0.95] font-bold tracking-[-0.035em]">Profile</h1>
          <p className="text-sm text-mist mt-4">Your training and settings, all local.</p>
        </motion.header>

        {/* Month calendar, streak and workout history land in phase B (vb-workout-history-v1);
            the PR list lands in phase C (vb-personal-bests-v1). Nothing renders until real data exists. */}

        <motion.section className="border-t border-dashed border-white/25 pt-6" {...rise(0.1)}>
          <h2 className="text-lg font-bold tracking-[-0.02em]">Rest notifications</h2>
          <p className="text-sm text-mist leading-relaxed mt-1.5">
            Get an alert when a rest timer ends, even if the app is in the background.
          </p>
          <div className="mt-4">
            {!notificationsSupported() ? (
              <p className="text-xs text-mist">Notifications aren't supported in this browser.</p>
            ) : notifPerm === 'granted' ? (
              <p className="text-xs text-mint font-bold">
                Notifications on — you'll get an alert when rest ends.
              </p>
            ) : notifPerm === 'denied' ? (
              <p className="text-xs text-mist">
                Notifications are blocked — enable them for this app in your phone settings to get
                rest alerts.
              </p>
            ) : (
              <button
                onClick={async () => {
                  hapticTap();
                  setNotifPerm(await requestNotifications());
                }}
                className="w-full bg-white/10 hover:bg-white/20 font-bold text-sm py-3 rounded-xl transition-colors"
              >
                Notify me when rest ends
              </button>
            )}
          </div>
        </motion.section>
      </main>
    </div>
  );
}
