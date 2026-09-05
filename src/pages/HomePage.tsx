import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Medal, Play } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { TRAINING_PLAN } from '../data';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { PROGRESS_KEY, ProgressMap, getWeekProgress } from '../lib/progress';
import { useActiveSession } from '../lib/session';
import { hapticSelect } from '../lib/feedback';
import { useEntranceOnce } from '../lib/animation';
import { coerceHistory, getWeekStreak, CompletedWorkout, HISTORY_KEY } from '../lib/history';
import { getBests, listPrs } from '../lib/bests';
import { formatElapsed } from './WorkoutPage';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning.';
  if (h < 18) return 'Good afternoon.';
  return 'Good evening.';
}

export default function HomePage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const entered = useEntranceOnce('home');
  const [completedSets] = useLocalStorage<ProgressMap>(PROGRESS_KEY, {});
  const [historyRaw] = useLocalStorage<CompletedWorkout[]>(HISTORY_KEY, []);
  const streak = getWeekStreak(coerceHistory(historyRaw));
  const { session, elapsed } = useActiveSession();
  // First read bootstraps vb-personal-bests-v1 from the progress map (spec, phase C).
  const [recentPrs] = useState(() => listPrs(getBests()).slice(0, 3));

  // Resume point: the first week that still has incomplete sets.
  const currentWeek =
    TRAINING_PLAN.find((w) => getWeekProgress(w, completedSets).percentage < 100) ??
    TRAINING_PLAN[TRAINING_PLAN.length - 1];
  const weekProgress = getWeekProgress(currentWeek, completedSets);

  let sessionTitle: string | null = null;
  if (session) {
    for (const week of TRAINING_PLAN) {
      const found = week.days.find((d) => d.id === session.dayId);
      if (found) {
        sessionTitle = found.title.split(': ')[1] || found.title;
        break;
      }
    }
  }

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
          <h1 className="text-[3.25rem] leading-[0.95] font-bold tracking-[-0.035em]">
            {greeting()}
          </h1>
          <p className="text-sm text-mist mt-4">Strength &amp; power for volleyball.</p>
          {streak > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3.5 py-2 mt-4 text-sm font-bold">
              🔥 <span className="text-flame">{streak} week streak</span>
            </span>
          )}
        </motion.header>

        <div className="space-y-4">
          {session && sessionTitle && (
            <motion.div {...rise(0.08)}>
              <button
                onClick={() => {
                  hapticSelect();
                  navigate(`/workout/${session.dayId}`);
                }}
                className="w-full bg-mint text-court-deep rounded-2xl px-5 py-4 text-left transition-transform active:scale-[0.98]"
              >
                <p className="text-[0.6875rem] font-bold text-court-deep/60">
                  Workout in progress · <span className="tabular-nums">{formatElapsed(elapsed)}</span>
                </p>
                <div className="flex items-center justify-between gap-3 mt-1">
                  <h2 className="text-lg font-bold tracking-[-0.02em] min-w-0 truncate">
                    {sessionTitle}
                  </h2>
                  <span className="flex items-center gap-1.5 bg-court-deep text-mint text-[0.6875rem] font-bold px-3 py-1.5 rounded-full flex-shrink-0">
                    <Play className="w-3 h-3 fill-current" />
                    Jump back in
                  </span>
                </div>
              </button>
            </motion.div>
          )}

          <motion.div {...rise(session ? 0.15 : 0.08)}>
            <Link
              to={`/week/${currentWeek.weekNumber}`}
              onClick={hapticSelect}
              className="block bg-white/10 rounded-2xl px-5 py-4 hover:bg-white/15 transition-transform active:scale-[0.98]"
            >
              <p className="text-[0.6875rem] font-bold text-mist">Current week</p>
              <div className="flex items-center justify-between gap-3 mt-1">
                <h2 className="text-lg font-bold tracking-[-0.02em]">
                  Week {currentWeek.weekNumber}
                </h2>
                <ChevronRight className="w-5 h-5 text-mist flex-shrink-0" />
              </div>
              <p className="text-xs leading-snug text-white/80 line-clamp-2 mt-1">
                {currentWeek.focus}
              </p>
              {weekProgress.completed > 0 && (
                <div className="flex items-center gap-2 mt-3.5">
                  <div className="flex-1 h-2 rounded-full bg-court-deep/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-mint transition-all duration-500"
                      style={{ width: `${weekProgress.percentage}%` }}
                    />
                  </div>
                  <span className="text-[0.6875rem] font-bold text-mint tabular-nums">
                    {weekProgress.completed}/{weekProgress.total}
                  </span>
                </div>
              )}
            </Link>
          </motion.div>
        </div>

        {recentPrs.length > 0 && (
          <motion.section className="mt-8" {...rise(session ? 0.22 : 0.15)}>
            <h2 className="text-lg font-bold tracking-[-0.02em]">Recent PRs</h2>
            <ul
              aria-label="Recent PRs"
              className="bg-white/5 rounded-2xl divide-y divide-white/[0.06] overflow-hidden mt-3"
            >
              {recentPrs.map((pr) => (
                <li key={`${pr.exercise}-${pr.label}`} className="flex items-center gap-3 px-4 py-3">
                  <Medal className="w-4 h-4 text-zest flex-shrink-0" />
                  <p className="font-bold tracking-[-0.02em] text-sm min-w-0 truncate flex-1">
                    {pr.exercise}
                  </p>
                  <p className="text-sm font-bold text-zest tabular-nums flex-shrink-0">{pr.label}</p>
                </li>
              ))}
            </ul>
          </motion.section>
        )}
      </main>
    </div>
  );
}
