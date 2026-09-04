import React, { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { TRAINING_PLAN, WorkoutDay } from '../data';
import { formatElapsed } from './WorkoutPage';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { PROGRESS_KEY, ProgressMap, getDayProgress, getDayVolume } from '../lib/progress';
import { hapticTap, hapticSelect } from '../lib/feedback';
import { endSession, getActiveSession } from '../lib/session';
import { appendWorkout } from '../lib/history';

type CompletionState = { elapsed: number };

/**
 * The save screen (Finish → here). The session deliberately survives arriving:
 * it only ends at Save (written to history) or Discard (day's sets cleared), so
 * the back arrow returns losslessly to the live workout.
 */
export default function CompletionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const state = (location.state ?? null) as CompletionState | null;

  // Find the day across all weeks — stats recompute from the progress map, so a
  // direct visit (no router state) still shows the truth.
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
  const dayName = day ? day.title.split(': ')[1] || day.title : '';

  const [completedSets, setCompletedSets] = useLocalStorage<ProgressMap>(PROGRESS_KEY, {});
  const [title, setTitle] = useState(dayName);
  const [note, setNote] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Duration is frozen on arrival — the workout is over; only saving remains.
  const [elapsed] = useState(() => {
    const session = getActiveSession();
    if (session && session.dayId === id) return Math.floor((Date.now() - session.startedAt) / 1000);
    return state?.elapsed ?? 0;
  });

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

  const progress = getDayProgress(day, completedSets);
  const volume = getDayVolume(day, completedSets);

  const saveWorkout = () => {
    hapticSelect();
    const completedAt = Date.now();
    const trimmedTitle = title.trim();
    const trimmedNote = note.trim();
    appendWorkout({
      id: `${day!.id}-${completedAt}`,
      dayId: day!.id,
      weekNum,
      dayTitle: day!.title,
      completedAt,
      elapsed,
      volume,
      setsDone: progress.completed,
      totalSets: progress.total,
      ...(trimmedTitle && trimmedTitle !== dayName ? { title: trimmedTitle } : {}),
      ...(trimmedNote ? { note: trimmedNote } : {}),
    });
    endSession(day!.id);
    navigate(`/congrats/${day!.id}`, {
      state: {
        elapsed,
        volume,
        setsDone: progress.completed,
        totalSets: progress.total,
        weekNum,
        dayTitle: day!.title,
      },
    });
  };

  // True discard — identical semantics to the live workout's cancel sheet:
  // end the session AND clear this day's logged sets; nothing reaches history.
  const discardWorkout = () => {
    hapticSelect();
    endSession(day!.id);
    setCompletedSets((prev) => {
      const next: ProgressMap = {};
      for (const [key, log] of Object.entries(prev)) {
        if (!key.startsWith(`${day!.id}-`)) next[key] = log;
      }
      return next;
    });
    navigate(`/week/${weekNum}`);
  };

  const rise = (delay: number) => ({
    initial: reduceMotion ? false : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay, ease: 'easeOut' as const },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="max-w-xl mx-auto w-full px-5 pt-4 flex items-center gap-3">
        <button
          onClick={() => {
            hapticTap();
            navigate(`/workout/${day!.id}`);
          }}
          aria-label="Back to workout"
          className="w-10 h-10 flex-shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold tracking-[-0.02em] leading-tight">Save workout</h1>
          <p className="text-[0.6875rem] font-bold text-mist">
            Week {weekNum} · {dayName}
          </p>
        </div>
      </header>

      <main className="max-w-xl mx-auto w-full px-5 flex-1 flex flex-col justify-center py-10">
        <motion.div {...rise(0.05)}>
          <label htmlFor="workout-title" className="block text-[0.6875rem] font-bold text-mist mb-1.5">
            Title
          </label>
          <input
            id="workout-title"
            type="text"
            aria-label="Workout title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white/10 rounded-xl px-4 py-3.5 text-lg font-bold tracking-[-0.02em] text-white focus:outline-none focus:ring-2 focus:ring-mint"
          />
        </motion.div>

        <motion.div className="mt-4" {...rise(0.12)}>
          <label htmlFor="workout-note" className="block text-[0.6875rem] font-bold text-mist mb-1.5">
            Note
          </label>
          <textarea
            id="workout-note"
            aria-label="Workout note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How did it feel? (optional)"
            rows={3}
            className="w-full bg-white/10 rounded-xl px-4 py-3.5 text-sm font-medium text-white placeholder:text-mist focus:outline-none focus:ring-2 focus:ring-mint resize-none"
          />
        </motion.div>

        <motion.div
          className="bg-zest text-court-deep rounded-3xl p-6 mt-6"
          initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.2 }}
        >
          <div className="grid grid-cols-3 divide-x divide-court-deep/15">
            <div className="pr-4">
              <p className="text-xs font-bold text-court-deep/60">Duration</p>
              <p className="text-2xl font-bold tabular-nums tracking-[-0.03em] mt-1.5">
                {formatElapsed(elapsed)}
              </p>
            </div>
            <div className="px-4">
              <p className="text-xs font-bold text-court-deep/60">Volume</p>
              <p className="text-2xl font-bold tabular-nums tracking-[-0.03em] mt-1.5">
                {Math.round(volume).toLocaleString()}
                <span className="text-sm font-bold ml-0.5 text-court-deep/70">kg</span>
              </p>
            </div>
            <div className="pl-4">
              <p className="text-xs font-bold text-court-deep/60">Sets</p>
              <p className="text-2xl font-bold tabular-nums tracking-[-0.03em] mt-1.5">
                {progress.completed}/{progress.total}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.button
          onClick={saveWorkout}
          className="mt-8 w-full bg-mint text-court-deep font-bold text-base py-4 rounded-full transition-transform active:scale-[0.98]"
          {...rise(0.3)}
        >
          Save workout
        </motion.button>

        {confirmDiscard ? (
          <div className="mt-3 bg-flame/10 rounded-2xl px-4 py-3.5">
            <p className="text-sm font-bold text-flame text-center mb-3">
              This clears {progress.completed} logged {progress.completed === 1 ? 'set' : 'sets'}.
            </p>
            <button
              onClick={discardWorkout}
              className="w-full bg-flame text-white font-bold text-sm py-3.5 rounded-xl transition-transform active:scale-[0.98]"
            >
              Yes, discard
            </button>
          </div>
        ) : (
          <motion.button
            onClick={() => {
              hapticTap();
              setConfirmDiscard(true);
            }}
            className="mt-3 w-full text-flame font-bold text-sm py-3"
            {...rise(0.38)}
          >
            Discard workout
          </motion.button>
        )}
      </main>
    </div>
  );
}
