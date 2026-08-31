import React from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { TRAINING_PLAN } from '../data';
import { formatElapsed } from './WorkoutPage';
import { hapticTap } from '../lib/feedback';

type CompletionState = {
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

export default function CompletionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  const state = (location.state ?? null) as CompletionState | null;

  // Fallbacks for a direct visit without router state
  let weekNum = state?.weekNum;
  let dayTitle = state?.dayTitle;
  if (!weekNum || !dayTitle) {
    for (const week of TRAINING_PLAN) {
      const found = week.days.find((d) => d.id === id);
      if (found) {
        weekNum = week.weekNumber;
        dayTitle = found.title;
        break;
      }
    }
  }

  const dayName = dayTitle ? dayTitle.split(': ')[1] || dayTitle : 'Workout';

  const rise = (delay: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay, ease: 'easeOut' as const },
  });

  return (
    <div className="min-h-screen flex flex-col">
      {!reduceMotion && <Confetti />}

      <main className="max-w-xl mx-auto w-full px-5 flex-1 flex flex-col justify-center py-12">
        <motion.p
          className="text-xs font-bold uppercase tracking-[0.2em] text-mist mb-3"
          {...rise(0.05)}
        >
          Week {weekNum} · {dayName}
        </motion.p>

        <motion.h1
          className="text-[3.25rem] leading-[0.95] font-bold tracking-[-0.03em] uppercase"
          {...rise(0.12)}
        >
          Nice
          <br />
          <span className="text-mint">work.</span>
        </motion.h1>

        <motion.div
          className="bg-zest text-court-deep rounded-3xl p-6 mt-8"
          initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.25 }}
        >
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[0.625rem] font-bold uppercase tracking-[0.15em] opacity-70">Duration</p>
              <p className="text-2xl font-bold tabular-nums tracking-[-0.02em] mt-1">
                {state ? formatElapsed(state.elapsed) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[0.625rem] font-bold uppercase tracking-[0.15em] opacity-70">Volume</p>
              <p className="text-2xl font-bold tabular-nums tracking-[-0.02em] mt-1">
                {state ? `${Math.round(state.volume).toLocaleString()}` : '—'}
                <span className="text-sm font-bold ml-0.5">kg</span>
              </p>
            </div>
            <div>
              <p className="text-[0.625rem] font-bold uppercase tracking-[0.15em] opacity-70">Sets</p>
              <p className="text-2xl font-bold tabular-nums tracking-[-0.02em] mt-1">
                {state ? `${state.setsDone}/${state.totalSets}` : '—'}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.button
          onClick={() => {
            hapticTap();
            navigate(`/week/${weekNum ?? 1}`);
          }}
          className="mt-8 w-full bg-white text-court font-bold text-base py-4 rounded-full transition-transform active:scale-[0.98]"
          {...rise(0.4)}
        >
          Done
        </motion.button>

        <motion.button
          onClick={() => {
            hapticTap();
            navigate('/');
          }}
          className="mt-3 w-full text-mist font-bold text-sm py-2"
          {...rise(0.5)}
        >
          Back to programme
        </motion.button>
      </main>
    </div>
  );
}
