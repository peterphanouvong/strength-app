import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Share } from 'lucide-react';
import { TRAINING_PLAN, WorkoutDay } from '../data';
import { formatElapsed } from './WorkoutPage';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { hapticTap, hapticSelect } from '../lib/feedback';
import { shareWorkout } from '../lib/share';
import { coerceHistory, getWeekStreak, CompletedWorkout, HISTORY_KEY } from '../lib/history';
import { MonthCalendar } from '../components/MonthCalendar';

type CongratsState = {
  elapsed: number;
  volume: number;
  setsDone: number;
  totalSets: number;
  weekNum: number;
  dayTitle: string;
};

const CONFETTI_COLORS = ['#f7e353', '#7bf1a8', '#ffffff', '#ff3d2e', '#b9b9f2'];

const Confetti: React.FC = () => {
  const pieces = Array.from({ length: 28 });
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {pieces.map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-[2px]"
          style={{
            left: `${(i * 37 + 11) % 100}%`,
            top: -20,
            width: i % 3 === 0 ? 10 : 6,
            height: i % 3 === 0 ? 6 : 12,
            backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }}
          initial={{ y: -30, opacity: 1, rotate: (i * 53) % 360 }}
          animate={{ y: '105vh', opacity: [1, 1, 0.8], rotate: (i * 53) % 360 + ((i % 2 === 0 ? 1 : -1) * 540) }}
          transition={{
            duration: 2.6 + (i % 5) * 0.5,
            delay: (i % 9) * 0.12,
            ease: [0.2, 0.6, 0.4, 1],
          }}
        />
      ))}
    </div>
  );
};

/** Streak-aware congratulation: first save vs streak started vs streak continuing. */
function congratsCopy(historyCount: number, streak: number): string | null {
  if (historyCount === 0) return null;
  if (historyCount === 1) return 'First workout saved — day one is in the books.';
  if (streak >= 2) return `That's ${streak} weeks in a row. Keep it rolling.`;
  return 'Streak started — one workout next week keeps it alive.';
}

export default function CongratsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  const [historyRaw] = useLocalStorage<CompletedWorkout[]>(HISTORY_KEY, []);
  const history = coerceHistory(historyRaw);
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'saved'>('idle');

  let day: WorkoutDay | undefined;
  let weekNum = 1;
  for (const week of TRAINING_PLAN) {
    const found = week.days.find((d) => d.id === id);
    if (found) {
      day = found;
      weekNum = week.weekNumber;
      break;
    }
  }

  if (!day) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-mist">Workout not found.</p>
        <button onClick={() => navigate('/programme')} className="text-white font-bold underline">
          Back to programme
        </button>
      </div>
    );
  }

  // Stats: router state from Save, else the day's latest saved entry (direct visit).
  const latestForDay = [...history]
    .filter((h) => h.dayId === id)
    .sort((a, b) => b.completedAt - a.completedAt)[0];
  const state =
    (location.state as CongratsState | null) ??
    (latestForDay
      ? {
          elapsed: latestForDay.elapsed,
          volume: latestForDay.volume,
          setsDone: latestForDay.setsDone,
          totalSets: latestForDay.totalSets,
          weekNum: latestForDay.weekNum,
          dayTitle: latestForDay.dayTitle,
        }
      : null);

  const dayName = day.title.split(': ')[1] || day.title;
  const streak = getWeekStreak(history);
  const copy = congratsCopy(history.length, streak);
  const now = new Date();

  const handleShare = async () => {
    if (!state || shareState === 'busy') return;
    hapticSelect();
    setShareState('busy');
    try {
      const result = await shareWorkout({
        dayName,
        weekNum,
        duration: formatElapsed(state.elapsed),
        volume: `${Math.round(state.volume).toLocaleString()} kg`,
        sets: `${state.setsDone}/${state.totalSets}`,
      });
      setShareState(result === 'downloaded' ? 'saved' : 'idle');
    } catch {
      setShareState('idle');
    }
  };

  const rise = (delay: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay, ease: 'easeOut' as const },
  });

  return (
    <div className="min-h-screen flex flex-col">
      {!reduceMotion && <Confetti />}

      <main className="max-w-xl mx-auto w-full px-5 flex-1 flex flex-col justify-center py-10">
        <motion.p className="text-sm font-bold text-mist mb-3" {...rise(0.05)}>
          Week {weekNum} · {dayName}
        </motion.p>

        <motion.h1
          className="text-[3.25rem] leading-[0.92] font-bold tracking-[-0.04em] uppercase"
          {...rise(0.12)}
        >
          Nice
          <br />
          <span className="text-mint">work.</span>
        </motion.h1>

        <motion.div
          className="bg-zest text-court-deep rounded-3xl p-6 mt-6"
          initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.22 }}
        >
          <div className="grid grid-cols-3 divide-x divide-court-deep/15">
            <div className="pr-4">
              <p className="text-xs font-bold text-court-deep/60">Duration</p>
              <p className="text-2xl font-bold tabular-nums tracking-[-0.03em] mt-1.5">
                {state ? formatElapsed(state.elapsed) : '—'}
              </p>
            </div>
            <div className="px-4">
              <p className="text-xs font-bold text-court-deep/60">Volume</p>
              <p className="text-2xl font-bold tabular-nums tracking-[-0.03em] mt-1.5">
                {state ? `${Math.round(state.volume).toLocaleString()}` : '—'}
                {state && <span className="text-sm font-bold ml-0.5 text-court-deep/70">kg</span>}
              </p>
            </div>
            <div className="pl-4">
              <p className="text-xs font-bold text-court-deep/60">Sets</p>
              <p className="text-2xl font-bold tabular-nums tracking-[-0.03em] mt-1.5">
                {state ? `${state.setsDone}/${state.totalSets}` : '—'}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div className="mt-4" {...rise(0.3)}>
          <MonthCalendar monthDate={new Date(now.getFullYear(), now.getMonth(), 1)} history={history} />
          {streak > 0 && (
            <p className="text-base font-bold text-zest mt-3.5 text-center">
              🔥 <span className="text-flame">{streak} week streak</span>
            </p>
          )}
          {copy && <p className="text-sm text-mist text-center mt-1.5">{copy}</p>}
        </motion.div>

        {state && (
          <motion.button
            onClick={handleShare}
            className="mt-7 w-full bg-mint text-court-deep font-bold text-base py-4 rounded-full transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
            {...rise(0.38)}
          >
            <Share className="w-5 h-5" />
            {shareState === 'busy' ? 'Preparing…' : shareState === 'saved' ? 'Image saved' : 'Share'}
          </motion.button>
        )}

        <motion.button
          onClick={() => {
            hapticTap();
            navigate(`/week/${weekNum}`);
          }}
          className="mt-3 w-full bg-white/10 text-white font-bold text-base py-4 rounded-full transition-transform active:scale-[0.98]"
          {...rise(0.45)}
        >
          Done
        </motion.button>
      </main>
    </div>
  );
}
