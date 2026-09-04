import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Check, Timer, Plus, X, History, MoreVertical } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { TRAINING_PLAN, WorkoutDay, Exercise } from '../data';
import { cn } from '../lib/utils';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { PROGRESS_KEY, ProgressMap, SetLog, SetType, getDayProgress, getDayVolume } from '../lib/progress';
import { BottomSheet } from '../components/BottomSheet';
import {
  unlockAudio,
  playSetDone,
  playWorkoutDone,
  hapticSetDone,
  hapticSetUndone,
  hapticExerciseDone,
  hapticWorkoutDone,
  hapticTap,
  hapticSelect,
  notificationsSupported,
  notificationPermission,
  requestNotifications,
} from '../lib/feedback';
import { startRest, extendRest, skipRest, subscribeRest, getRest, getRestRemaining } from '../lib/rest';
import { ActiveSession, getActiveSession, startSession, endSession } from '../lib/session';
import { useEntranceOnce } from '../lib/animation';

const REST_OVERRIDES_KEY = 'vb-rest-overrides-v1';

/**
 * Numeric placeholder hint from a reps prescription. Only a leading number (or
 * range) counts: '6' → '6', '6-8' → '6-8', '8/leg' → '8', '8 / 30 s' → '8'.
 * Non-numeric prescriptions ('Max-2') yield undefined — never '-2' or '830'.
 */
function repsPlaceholder(reps: string): string | undefined {
  return reps.trim().match(/^\d+(?:-\d+)?/)?.[0];
}
const REST_OPTIONS = [0, 30, 60, 90, 120, 150, 180, 240, 300];

const SET_TYPES: { type: SetType | undefined; letter: string; label: string; hint: string; color: string }[] = [
  { type: 'W', letter: 'W', label: 'Warm-up set', hint: 'Lighter prep work before the working sets', color: 'text-zest' },
  { type: undefined, letter: '1', label: 'Normal set', hint: 'A working set as prescribed', color: 'text-white' },
  { type: 'F', letter: 'F', label: 'Failure set', hint: 'Taken to technical failure', color: 'text-flame' },
  { type: 'D', letter: 'D', label: 'Drop set', hint: 'Strip the load and keep going', color: 'text-mist' },
];

const SET_TYPE_COLOR: Record<SetType, string> = { W: 'text-zest', F: 'text-flame', D: 'text-mist' };

function conflictFor(dayId: string | undefined): ActiveSession | null {
  if (!dayId) return null;
  const s = getActiveSession();
  return s && s.dayId !== dayId ? s : null;
}

/**
 * Browse-first session state. Opening a workout never starts a session: the page
 * is a read-only *preview* until `begin()` goes live — via the Start CTA or the
 * tap-a-set convenience. A conflicting session (another day's workout running)
 * is only surfaced at that moment, never on open.
 */
function useWorkoutSession(dayId: string | undefined) {
  const [live, setLive] = useState(() => !!dayId && getActiveSession()?.dayId === dayId);
  const [elapsed, setElapsed] = useState(0);
  // Another day's session, set when the user attempts to start this one.
  const [conflict, setConflict] = useState<ActiveSession | null>(null);

  // The route param can change without remounting (e.g. "Go back to that workout"
  // navigates /workout/w1-d2 → /workout/w1-d1). Re-derive the mode synchronously
  // during render so a stale sheet or mode never blocks the resumed workout.
  const [prevDayId, setPrevDayId] = useState(dayId);
  if (dayId !== prevDayId) {
    setPrevDayId(dayId);
    setLive(!!dayId && getActiveSession()?.dayId === dayId);
    setConflict(null);
    setElapsed(0);
  }

  useEffect(() => {
    if (!dayId || !live) return;
    const session = getActiveSession();
    if (!session || session.dayId !== dayId) return;
    const startedAt = session.startedAt;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [dayId, live]);

  /**
   * Go live: resume this day's session or start a fresh one. Returns false —
   * raising the conflict sheet instead — when another day's workout is running.
   */
  const begin = (): boolean => {
    if (!dayId) return false;
    const other = conflictFor(dayId);
    if (other) {
      setConflict(other);
      return false;
    }
    if (getActiveSession()?.dayId !== dayId) startSession(dayId);
    setLive(true);
    return true;
  };

  // Conflict resolution: overwrite the other day's session with this one's.
  const takeOver = () => {
    if (dayId) startSession(dayId);
    setConflict(null);
    setLive(true);
  };

  // Only end the session this page owns — if another tab took over (the session
  // now belongs to a different day), leave it running.
  const clear = () => {
    if (dayId) endSession(dayId);
  };

  return { live, elapsed, begin, clear, conflict, dismissConflict: () => setConflict(null), takeOver };
}

export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  // Find the day across all weeks (before any session side effects — an invalid
  // id must never start a session, only render the not-found page below).
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

  const entered = useEntranceOnce('workout');
  const [completedSets, setCompletedSets] = useLocalStorage<ProgressMap>(PROGRESS_KEY, {});
  const [restOverrides, setRestOverrides] = useLocalStorage<Record<string, number>>(REST_OVERRIDES_KEY, {});
  const { live, elapsed, begin, clear, conflict, dismissConflict, takeOver } = useWorkoutSession(
    day ? id : undefined
  );

  // Rest countdown lives in a module-level store (src/lib/rest.ts) so it — and
  // its expiry feedback — survives this page unmounting on in-app navigation.
  const rest = useSyncExternalStore(subscribeRest, getRest);
  const restRemaining = useSyncExternalStore(subscribeRest, getRestRemaining);
  const [setTypeTarget, setSetTypeTarget] = useState<{ exercise: Exercise; setIndex: number } | null>(null);
  const [restTarget, setRestTarget] = useState<Exercise | null>(null);
  const [historyTarget, setHistoryTarget] = useState<Exercise | null>(null);
  const [justCompleted, setJustCompleted] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState(notificationPermission());
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

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

  const restFor = (exercise: Exercise) => restOverrides[exercise.name] ?? exercise.restSec;

  /** Remove every logged entry for a day from the progress map (discard semantics). */
  const clearDayProgress = (targetDayId: string) => {
    setCompletedSets((prev) => {
      const next: ProgressMap = {};
      for (const [key, log] of Object.entries(prev)) {
        if (!key.startsWith(`${targetDayId}-`)) next[key] = log;
      }
      return next;
    });
  };

  const closeCancelSheet = () => {
    setCancelOpen(false);
    setConfirmDiscard(false);
  };

  const endKeepingSets = () => {
    hapticSelect();
    clear();
    closeCancelSheet();
    navigate(`/week/${weekNum}`);
  };

  const discardWorkout = () => {
    hapticSelect();
    clear();
    clearDayProgress(day!.id);
    closeCancelSheet();
    navigate(`/week/${weekNum}`);
  };

  const startWorkout = () => {
    hapticSelect();
    unlockAudio();
    begin();
  };

  const finishWorkout = () => {
    if (progress.completed === 0) {
      // Nothing logged — nothing to save. End the empty session and step back out.
      clear();
      hapticTap();
      navigate(`/week/${weekNum}`);
      return;
    }
    unlockAudio();
    hapticWorkoutDone();
    playWorkoutDone();
    // The session deliberately stays alive through Finish — it ends on the
    // completion screen's Save/Done, so backing out of that screen is lossless.
    navigate(`/complete/${day!.id}`, {
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

  const toggleSet = (exercise: Exercise, setIndex: number) => {
    // Preview convenience: tapping a set's check both starts the session and logs
    // the set. A conflicting session raises the sheet instead — nothing is logged.
    if (!live && !begin()) return;
    const key = `${exercise.id}-${setIndex}`;
    const wasCompleted = completedSets[key]?.completed ?? false;
    unlockAudio();
    setCompletedSets((prev) => {
      const current = prev[key] || { completed: false, weight: '', actualReps: '' };
      return {
        ...prev,
        [key]: { ...current, completed: !current.completed },
      };
    });
    if (!wasCompleted) {
      // Dopamine: pop + burst + haptic + blip
      setJustCompleted(`${key}:${Date.now()}`);
      playSetDone();
      const doneInExercise = Array.from({ length: exercise.sets }).filter(
        (_, i) => i === setIndex || completedSets[`${exercise.id}-${i}`]?.completed
      ).length;
      if (doneInExercise === exercise.sets) {
        hapticExerciseDone();
      } else {
        hapticSetDone();
      }
      const restSec = restFor(exercise);
      if (restSec > 0) {
        startRest({ endsAt: Date.now() + restSec * 1000, total: restSec, label: exercise.name });
      }
    } else {
      hapticSetUndone();
    }
  };

  const updateSetLog = (exerciseId: string, setIndex: number, field: 'weight' | 'actualReps' | 'timeSec', value: string) => {
    const key = `${exerciseId}-${setIndex}`;
    setCompletedSets((prev) => {
      const current = prev[key] || { completed: false, weight: '', actualReps: '' };
      return {
        ...prev,
        [key]: { ...current, [field]: value },
      };
    });
  };

  const setSetType = (exerciseId: string, setIndex: number, setType: SetType | undefined) => {
    const key = `${exerciseId}-${setIndex}`;
    setCompletedSets((prev) => {
      const current = prev[key] || { completed: false, weight: '', actualReps: '' };
      return {
        ...prev,
        [key]: { ...current, setType },
      };
    });
    setSetTypeTarget(null);
  };

  const getPreviousSetLog = (exerciseName: string, currentWeekNum: number, setIndex: number) => {
    if (currentWeekNum === 1) return null;

    for (let w = currentWeekNum - 1; w >= 1; w--) {
      const prevWeek = TRAINING_PLAN.find((plan) => plan.weekNumber === w);
      if (!prevWeek) continue;

      for (const d of prevWeek.days) {
        const prevExercise = d.exercises.find((e) => e.name === exerciseName);
        if (prevExercise) {
          const key = `${prevExercise.id}-${setIndex}`;
          const log = completedSets[key];
          if (log && log.completed && (log.weight || log.actualReps || log.timeSec)) {
            return log;
          }
        }
      }
    }
    return null;
  };

  return (
    <div className="min-h-screen pb-28">
      {/* Sticky header */}
      <header className="bg-court/90 backdrop-blur-md border-b border-white/10 sticky top-0 z-20">
        <div className="max-w-xl mx-auto px-5 py-3 flex items-center gap-3">
          <button
            onClick={() => {
              hapticTap();
              navigate(`/week/${weekNum}`);
            }}
            aria-label="Back to week"
            className="w-10 h-10 flex-shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold tracking-[-0.02em] leading-tight truncate">
              {day.title.split(': ')[1] || day.title}
            </h1>
            <p className="text-[0.6875rem] font-bold text-mist">
              Week {weekNum} · Day {day.title.split(':')[0].replace('Day ', '')}
            </p>
          </div>
          {live ? (
            <>
              <button
                onClick={finishWorkout}
                className="flex-shrink-0 bg-mint text-court-deep font-bold text-sm px-5 py-2.5 rounded-full transition-transform active:scale-95"
              >
                Finish
              </button>
              <button
                onClick={() => {
                  hapticTap();
                  setCancelOpen(true);
                }}
                aria-label="Workout options"
                className="w-10 h-10 flex-shrink-0 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
            </>
          ) : (
            <span className="flex-shrink-0 bg-white/10 text-mist font-bold text-xs px-3.5 py-2 rounded-full">
              Preview
            </span>
          )}
        </div>
        {/* header progress bar */}
        <div className="h-1.5 bg-court-deep">
          <div
            className="h-full bg-mint transition-all duration-500"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </header>

      <main className="max-w-xl mx-auto px-5 py-5">
        {/* Session stats */}
        <motion.div
          className="grid grid-cols-3 gap-3 mb-8"
          initial={reduceMotion || !entered ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <Stat label="Duration" value={live ? formatElapsed(elapsed) : '—'} accent="text-mint" />
          <Stat label="Volume" value={`${Math.round(volume).toLocaleString()} kg`} pop />
          <Stat label="Sets" value={`${progress.completed}/${progress.total}`} pop />
        </motion.div>

        <div className="space-y-10">
          {day.exercises.map((exercise, index) => (
            <motion.section
              key={exercise.id}
              initial={reduceMotion || !entered ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: Math.min(index * 0.07, 0.35), ease: 'easeOut' }}
            >
              <ExerciseSection
                exercise={exercise}
                index={index}
                weekNum={weekNum}
                live={live}
                restSec={restFor(exercise)}
                completedSets={completedSets}
                justCompleted={justCompleted}
                toggleSet={toggleSet}
                updateSetLog={updateSetLog}
                getPreviousSetLog={getPreviousSetLog}
                onPickSetType={(setIndex) => setSetTypeTarget({ exercise, setIndex })}
                onConfigureRest={() => setRestTarget(exercise)}
                onShowHistory={() => setHistoryTarget(exercise)}
              />
            </motion.section>
          ))}
        </div>
      </main>

      {/* Preview: sticky start CTA */}
      <AnimatePresence>
        {!live && (
          <motion.div
            className="fixed bottom-4 inset-x-4 z-30"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            <div className="max-w-xl mx-auto">
              <button
                onClick={startWorkout}
                className="w-full bg-mint text-court-deep font-bold text-base py-4 rounded-full shadow-xl transition-transform active:scale-[0.98]"
              >
                Start workout
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rest countdown bar */}
      <AnimatePresence>
        {live && rest && (
          <motion.div
            className="fixed bottom-4 inset-x-4 z-30"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          >
            <div className="max-w-xl mx-auto bg-court-deep border border-white/15 rounded-2xl px-4 py-3 shadow-xl">
              <div className="flex items-center gap-3">
                <Timer className="w-5 h-5 text-mint flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.6875rem] font-medium text-mist truncate">Rest · {rest.label}</p>
                  <p className="text-xl font-bold tabular-nums leading-tight">{formatElapsed(restRemaining)}</p>
                </div>
                <button
                  onClick={() => {
                    hapticTap();
                    extendRest(15);
                  }}
                  className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-xs font-bold px-3 py-2 rounded-full transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> 15s
                </button>
                <button
                  onClick={() => {
                    hapticTap();
                    skipRest();
                  }}
                  aria-label="Skip rest"
                  className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-mint rounded-full transition-all duration-300"
                  style={{ width: `${(restRemaining / rest.total) * 100}%` }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Set type sheet */}
      <BottomSheet
        open={setTypeTarget !== null}
        onClose={() => setSetTypeTarget(null)}
        title="Select set type"
      >
        <div className="space-y-2">
          {SET_TYPES.map((option) => {
            const currentType = setTypeTarget
              ? completedSets[`${setTypeTarget.exercise.id}-${setTypeTarget.setIndex}`]?.setType
              : undefined;
            const selected = currentType === option.type;
            return (
              <button
                key={option.label}
                onClick={() => {
                  hapticSelect();
                  if (setTypeTarget) setSetType(setTypeTarget.exercise.id, setTypeTarget.setIndex, option.type);
                }}
                className={cn(
                  'w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-left transition-colors',
                  selected ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'
                )}
              >
                <span
                  className={cn(
                    'w-10 h-10 rounded-xl bg-court-deep/60 flex items-center justify-center text-lg font-bold tabular-nums flex-shrink-0',
                    option.color
                  )}
                >
                  {option.letter}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[0.9375rem] leading-snug">{option.label}</span>
                  <span className="block text-xs text-mist mt-0.5">{option.hint}</span>
                </span>
                {selected && <Check className="w-5 h-5 text-mint flex-shrink-0" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* Rest config sheet */}
      <BottomSheet
        open={restTarget !== null}
        onClose={() => setRestTarget(null)}
        title="Rest timer"
        subtitle={restTarget?.name}
      >
        <div className="grid grid-cols-3 gap-2">
          {REST_OPTIONS.map((seconds) => {
            const selected = restTarget ? restFor(restTarget) === seconds : false;
            return (
              <button
                key={seconds}
                onClick={() => {
                  hapticSelect();
                  if (restTarget) {
                    setRestOverrides((prev) => ({ ...prev, [restTarget.name]: seconds }));
                    setRestTarget(null);
                  }
                }}
                className={cn(
                  'py-3.5 rounded-xl font-bold text-[0.9375rem] tabular-nums transition-colors',
                  selected ? 'bg-mint text-court-deep' : 'bg-white/10 hover:bg-white/20'
                )}
              >
                {seconds === 0 ? 'Off' : formatElapsed(seconds)}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-mist text-center leading-relaxed mt-4 px-4">
          Starts automatically when you tick a set. Saved for this exercise.
        </p>

        {notificationsSupported() && (
          <div className="mt-5 border-t border-white/10 pt-4">
            {notifPerm === 'granted' ? (
              <p className="text-xs text-mint font-bold text-center">
                Notifications on — you'll get an alert when rest ends.
              </p>
            ) : notifPerm === 'denied' ? (
              <p className="text-xs text-mist text-center">
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
        )}
      </BottomSheet>

      {/* Exercise history sheet */}
      <BottomSheet
        open={historyTarget !== null}
        onClose={() => setHistoryTarget(null)}
        title={historyTarget?.name ?? 'History'}
        subtitle="Exercise history"
      >
        {historyTarget && <ExerciseHistory exercise={historyTarget} completedSets={completedSets} />}
      </BottomSheet>

      {/* Cancel / end the live workout */}
      <BottomSheet open={cancelOpen} onClose={closeCancelSheet} title="End workout">
        <p className="text-sm text-mist leading-relaxed mb-5">
          {progress.completed > 0
            ? `You've logged ${progress.completed} of ${progress.total} sets. Keep them and pick this workout up later, or discard them.`
            : 'Nothing logged yet — ending now just stops the timer.'}
        </p>
        <button
          onClick={endKeepingSets}
          className="w-full bg-mint text-court-deep font-bold text-sm py-3.5 rounded-xl transition-transform active:scale-[0.98]"
        >
          End workout, keep sets
        </button>
        {confirmDiscard ? (
          <div className="mt-2 bg-flame/10 rounded-xl px-4 py-3.5">
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
          <button
            onClick={() => {
              hapticTap();
              setConfirmDiscard(true);
            }}
            className="w-full bg-white/10 hover:bg-white/20 text-flame font-bold text-sm py-3.5 rounded-xl mt-2 transition-colors"
          >
            Discard workout
          </button>
        )}
      </BottomSheet>

      {/* Another workout in progress (raised on Start, never on open) */}
      <BottomSheet open={conflict !== null} onClose={dismissConflict} title="Workout in progress">
        {conflict && (
          <ConflictContent
            conflict={conflict}
            onResume={() => {
              hapticTap();
              navigate(`/workout/${conflict.dayId}`);
            }}
            onTakeOver={() => {
              hapticSelect();
              takeOver();
            }}
            onDiscardOther={() => {
              hapticSelect();
              clearDayProgress(conflict.dayId);
              takeOver();
            }}
          />
        )}
      </BottomSheet>
    </div>
  );
}

const ConflictContent: React.FC<{
  conflict: ActiveSession;
  onResume: () => void;
  onTakeOver: () => void;
  onDiscardOther: () => void;
}> = ({ conflict, onResume, onTakeOver, onDiscardOther }) => {
  let title = 'Another workout';
  for (const week of TRAINING_PLAN) {
    const found = week.days.find((d) => d.id === conflict.dayId);
    if (found) {
      title = found.title.split(': ')[1] || found.title;
      break;
    }
  }
  const mins = Math.max(1, Math.round((Date.now() - conflict.startedAt) / 60000));

  return (
    <div>
      <p className="text-sm text-mist leading-relaxed mb-5">
        <span className="font-bold text-white">{title}</span> has been running for {mins} min. Finish
        or end it before starting this one.
      </p>
      <button
        onClick={onResume}
        className="w-full bg-mint text-court-deep font-bold text-sm py-3.5 rounded-xl transition-transform active:scale-[0.98]"
      >
        Go back to that workout
      </button>
      <button
        onClick={onTakeOver}
        className="w-full bg-white/10 hover:bg-white/20 font-bold text-sm py-3.5 rounded-xl mt-2 transition-colors"
      >
        End it and start this one
      </button>
      <button
        onClick={onDiscardOther}
        className="w-full bg-white/10 hover:bg-white/20 text-flame font-bold text-sm py-3.5 rounded-xl mt-2 transition-colors"
      >
        Discard the other workout
      </button>
    </div>
  );
};

/** Hevy-style per-exercise history: mini progression chart + logged sets by week. */
const ExerciseHistory: React.FC<{ exercise: Exercise; completedSets: ProgressMap }> = ({
  exercise,
  completedSets,
}) => {
  type Entry = {
    weekNumber: number;
    prescription: string;
    sets: { label: string; setType?: SetType }[];
    topWeight: number;
  };

  const entries: Entry[] = [];
  for (const week of TRAINING_PLAN) {
    for (const d of week.days) {
      const e = d.exercises.find((x) => x.name === exercise.name);
      if (!e) continue;
      const sets: Entry['sets'] = [];
      let topWeight = 0;
      for (let i = 0; i < e.sets; i++) {
        const log = completedSets[`${e.id}-${i}`];
        if (!log?.completed) continue;
        let label: string;
        if (e.tracking === 'weighted') {
          const reps = log.actualReps || e.reps;
          label = `${log.weight || '–'} kg × ${reps}`;
          topWeight = Math.max(topWeight, parseFloat(log.weight || '') || 0);
        } else if (e.tracking === 'time') {
          label = `${log.timeSec || '–'} s`;
        } else {
          label = `${log.actualReps || '–'} reps`;
        }
        sets.push({ label, setType: log.setType });
      }
      if (sets.length > 0) {
        entries.push({
          weekNumber: week.weekNumber,
          prescription: `${e.sets} × ${e.reps}${e.load ? ` @ ${e.load}` : ''}`,
          sets,
          topWeight,
        });
      }
    }
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-mist text-center py-6">
        No sets logged yet — your history with this exercise builds as you train.
      </p>
    );
  }

  const chartPoints = entries.filter((e) => e.topWeight > 0);
  const recentFirst = [...entries].reverse();

  return (
    <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
      {exercise.tracking === 'weighted' && chartPoints.length >= 2 && (
        <TopWeightChart points={chartPoints.map((e) => ({ week: e.weekNumber, weight: e.topWeight }))} />
      )}
      <div className="space-y-6">
        {recentFirst.map((entry) => (
          <div key={entry.weekNumber}>
            <div className="flex items-baseline justify-between mb-2">
              <p className="font-bold tracking-[-0.02em]">Week {entry.weekNumber}</p>
              <p className="text-xs font-medium text-mist tabular-nums">{entry.prescription}</p>
            </div>
            <div className="bg-white/5 rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
              {entry.sets.map((s, i) => (
                <div key={i} className="flex items-center gap-3.5 px-3.5 py-2.5">
                  <span
                    className={cn(
                      'w-5 text-center text-xs font-bold tabular-nums',
                      s.setType ? SET_TYPE_COLOR[s.setType] : 'text-mist'
                    )}
                  >
                    {s.setType ?? i + 1}
                  </span>
                  <span className="text-sm font-bold tabular-nums tracking-[-0.01em]">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Small SVG line chart of the heaviest completed set per week. */
const TopWeightChart: React.FC<{ points: { week: number; weight: number }[] }> = ({ points }) => {
  const W = 320;
  const H = 96;
  const PAD = 12;
  const min = Math.min(...points.map((p) => p.weight));
  const max = Math.max(...points.map((p) => p.weight));
  const range = max - min || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (w: number) => H - PAD - ((w - min) / range) * (H - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.weight)}`).join(' ');
  const area = `${path} L${x(points.length - 1)},${H} L${x(0)},${H} Z`;
  const last = points[points.length - 1];
  const heaviest = points.reduce((best, p) => (p.weight > best.weight ? p : best));

  return (
    <div className="bg-white/5 rounded-2xl px-4 pt-3.5 pb-1 mb-6">
      <p className="text-xs text-mist font-medium">
        Heaviest set · <span className="text-mint font-bold">{heaviest.weight} kg</span> in week {heaviest.week}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-1">
        <defs>
          <linearGradient id="top-weight-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7bf1a8" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#7bf1a8" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#top-weight-fill)" />
        <path d={path} fill="none" stroke="#7bf1a8" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.weight)} r={i === points.length - 1 ? 5 : 3.5} fill="#7bf1a8" />
        ))}
      </svg>
      <div className="flex justify-between text-[0.625rem] font-bold text-mist -mt-1 pb-1">
        <span>Wk {points[0].week}</span>
        <span>Wk {last.week}</span>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; accent?: string; pop?: boolean }> = ({
  label,
  value,
  accent,
  pop,
}) => (
  <div className="bg-white/10 rounded-2xl px-3.5 py-3">
    <p className="text-[0.6875rem] font-bold text-mist">{label}</p>
    {pop ? (
      <motion.p
        key={value}
        initial={{ scale: 1.25 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        className={cn('text-xl font-bold tabular-nums tracking-[-0.02em] leading-snug mt-0.5 origin-left', accent)}
      >
        {value}
      </motion.p>
    ) : (
      <p className={cn('text-xl font-bold tabular-nums tracking-[-0.02em] leading-snug mt-0.5', accent)}>{value}</p>
    )}
  </div>
);

const ExerciseSection: React.FC<{
  exercise: Exercise;
  index: number;
  weekNum: number;
  live: boolean;
  restSec: number;
  completedSets: ProgressMap;
  justCompleted: string | null;
  toggleSet: (exercise: Exercise, setIndex: number) => void;
  updateSetLog: (exerciseId: string, setIndex: number, field: 'weight' | 'actualReps' | 'timeSec', value: string) => void;
  getPreviousSetLog: (exerciseName: string, currentWeekNum: number, setIndex: number) => SetLog | null;
  onPickSetType: (setIndex: number) => void;
  onConfigureRest: () => void;
  onShowHistory: () => void;
}> = ({
  exercise,
  index,
  weekNum,
  live,
  restSec,
  completedSets,
  justCompleted,
  toggleSet,
  updateSetLog,
  getPreviousSetLog,
  onPickSetType,
  onConfigureRest,
  onShowHistory,
}) => {
  const tracking = exercise.tracking;

  const prevText = (log: SetLog | null): string => {
    if (!log) return '—';
    if (tracking === 'weighted') return `${log.weight || '–'}kg × ${log.actualReps || '–'}`;
    if (tracking === 'time') return log.timeSec ? `${log.timeSec}s` : '—';
    return log.actualReps ? `${log.actualReps} reps` : '—';
  };

  return (
    <div>
      {/* Exercise header */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <button
          onClick={() => {
            hapticTap();
            onShowHistory();
          }}
          className="flex items-center gap-2 text-left min-w-0 group"
        >
          <h2 className="text-xl font-bold tracking-[-0.02em] leading-snug">
            {index + 1}. {exercise.name}
          </h2>
          <History className="w-4 h-4 text-mist flex-shrink-0 group-hover:text-white transition-colors" />
        </button>
        <span className="flex-shrink-0 bg-white text-court text-xs font-bold px-2.5 py-1 rounded-md whitespace-nowrap mt-0.5">
          {exercise.sets} × {exercise.reps}
        </span>
      </div>
      {exercise.load && <p className="text-sm font-bold text-zest mb-1">{exercise.load}</p>}
      {exercise.notes && <p className="text-sm text-mist leading-relaxed mb-1">{exercise.notes}</p>}

      {/* Rest timer config (read-only in preview — editing belongs to a live workout) */}
      <button
        onClick={() => {
          hapticTap();
          onConfigureRest();
        }}
        disabled={!live}
        className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 rounded-full pl-2.5 pr-3 py-1.5 mt-1.5 text-[0.8125rem] font-bold text-mint tabular-nums transition-colors disabled:opacity-60 disabled:hover:bg-white/10"
      >
        <Timer className="w-3.5 h-3.5" />
        Rest timer: {restSec === 0 ? 'Off' : formatElapsed(restSec)}
      </button>

      {/* Table header */}
      <div className="grid grid-cols-12 gap-2 mt-3.5 mb-2 px-1 text-[0.625rem] font-bold text-mist uppercase text-center">
        <div className="col-span-1">Set</div>
        <div className={cn('text-left', tracking === 'weighted' ? 'col-span-3' : 'col-span-4')}>Previous</div>
        {tracking === 'weighted' && <div className="col-span-3">kg</div>}
        {tracking === 'weighted' && <div className="col-span-3">Reps</div>}
        {tracking === 'reps' && <div className="col-span-5">Reps</div>}
        {tracking === 'time' && <div className="col-span-5">Time (s)</div>}
        <div className="col-span-2">
          <Check className="w-3.5 h-3.5 mx-auto" strokeWidth={3} />
        </div>
      </div>

      {/* Set rows */}
      <div className="space-y-1.5">
        {Array.from({ length: exercise.sets }).map((_, setIndex) => {
          const key = `${exercise.id}-${setIndex}`;
          const log = completedSets[key] || { completed: false, weight: '', actualReps: '' };
          const prevLog = getPreviousSetLog(exercise.name, weekNum, setIndex);
          const isJustCompleted = justCompleted?.startsWith(`${key}:`) ?? false;

          const inputClass = cn(
            'w-full text-center rounded-lg py-2.5 text-sm font-bold tabular-nums text-white',
            'bg-white/10 focus:outline-none focus:ring-2 focus:ring-mint',
            log.completed && 'bg-transparent',
            !live && 'opacity-60'
          );
          const inputsDisabled = log.completed || !live;

          return (
            <div
              key={setIndex}
              className={cn(
                'grid grid-cols-12 gap-2 items-center px-1 py-1.5 rounded-xl transition-colors',
                log.completed && 'bg-mint/20 ring-1 ring-inset ring-mint/25'
              )}
            >
              <button
                onClick={() => {
                  hapticTap();
                  onPickSetType(setIndex);
                }}
                disabled={!live}
                aria-label="Change set type"
                className={cn(
                  'col-span-1 text-center font-bold tabular-nums py-1 rounded-md hover:bg-white/10 transition-colors',
                  log.setType
                    ? SET_TYPE_COLOR[log.setType]
                    : log.completed
                      ? 'text-mint'
                      : 'text-mist'
                )}
              >
                {log.setType ?? setIndex + 1}
              </button>

              <div className={cn('text-left', tracking === 'weighted' ? 'col-span-3' : 'col-span-4')}>
                <span className="text-xs font-medium text-mist whitespace-nowrap overflow-hidden text-ellipsis block">
                  {prevText(prevLog)}
                </span>
              </div>

              {tracking === 'weighted' && (
                <>
                  <div className="col-span-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder={prevLog?.weight || '—'}
                      value={log.weight || ''}
                      onChange={(e) => updateSetLog(exercise.id, setIndex, 'weight', e.target.value)}
                      disabled={inputsDisabled}
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder={prevLog?.actualReps || repsPlaceholder(exercise.reps) || '—'}
                      value={log.actualReps || ''}
                      onChange={(e) => updateSetLog(exercise.id, setIndex, 'actualReps', e.target.value)}
                      disabled={inputsDisabled}
                      className={inputClass}
                    />
                  </div>
                </>
              )}

              {tracking === 'reps' && (
                <div className="col-span-5">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={prevLog?.actualReps || repsPlaceholder(exercise.reps) || '—'}
                    value={log.actualReps || ''}
                    onChange={(e) => updateSetLog(exercise.id, setIndex, 'actualReps', e.target.value)}
                    disabled={inputsDisabled}
                    className={inputClass}
                  />
                </div>
              )}

              {tracking === 'time' && (
                <div className="col-span-5">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder={prevLog?.timeSec || '—'}
                    value={log.timeSec || ''}
                    onChange={(e) => updateSetLog(exercise.id, setIndex, 'timeSec', e.target.value)}
                    disabled={inputsDisabled}
                    className={inputClass}
                  />
                </div>
              )}

              <div className="col-span-2 flex justify-center">
                <motion.button
                  onClick={() => toggleSet(exercise, setIndex)}
                  whileTap={{ scale: 0.85 }}
                  animate={isJustCompleted ? { scale: [1, 1.3, 1], rotate: [0, -6, 0] } : { scale: 1 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  aria-label={log.completed ? 'Mark set incomplete' : 'Mark set complete'}
                  className={cn(
                    'relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200',
                    log.completed ? 'bg-mint text-court-deep' : 'bg-white/10 text-mist hover:bg-white/20'
                  )}
                >
                  {isJustCompleted && (
                    <motion.span
                      key={justCompleted}
                      className="absolute inset-0 rounded-xl border-2 border-mint pointer-events-none"
                      initial={{ opacity: 0.9, scale: 1 }}
                      animate={{ opacity: 0, scale: 2.1 }}
                      transition={{ duration: 0.55, ease: 'easeOut' }}
                    />
                  )}
                  {log.completed ? (
                    <Check className="w-5 h-5" strokeWidth={3} />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-white/40" />
                  )}
                </motion.button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
