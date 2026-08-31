import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Check, Timer, Plus, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { TRAINING_PLAN, WorkoutDay, Exercise } from '../data';
import { cn } from '../lib/utils';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { PROGRESS_KEY, ProgressMap, SetLog, SetType, getDayProgress, getDayVolume } from '../lib/progress';
import { BottomSheet } from '../components/BottomSheet';
import {
  unlockAudio,
  playSetDone,
  playRestOver,
  playWorkoutDone,
  hapticSetDone,
  hapticSetUndone,
  hapticExerciseDone,
  hapticWorkoutDone,
  hapticRestOver,
  hapticTap,
  hapticSelect,
  notificationsSupported,
  notificationPermission,
  requestNotifications,
  notifyRestOver,
} from '../lib/feedback';

const REST_OVERRIDES_KEY = 'vb-rest-overrides-v1';
const REST_OPTIONS = [0, 30, 60, 90, 120, 150, 180, 240, 300];

const SET_TYPES: { type: SetType | undefined; letter: string; label: string; hint: string; color: string }[] = [
  { type: 'W', letter: 'W', label: 'Warm-up set', hint: 'Lighter prep work before the working sets', color: 'text-zest' },
  { type: undefined, letter: '1', label: 'Normal set', hint: 'A working set as prescribed', color: 'text-white' },
  { type: 'F', letter: 'F', label: 'Failure set', hint: 'Taken to technical failure', color: 'text-flame' },
  { type: 'D', letter: 'D', label: 'Drop set', hint: 'Strip the load and keep going', color: 'text-mist' },
];

const SET_TYPE_COLOR: Record<SetType, string> = { W: 'text-zest', F: 'text-flame', D: 'text-mist' };

function useSessionTimer(dayId: string | undefined) {
  const key = `vb-session-start-${dayId}`;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!dayId) return;
    let start = Number(window.localStorage.getItem(key));
    if (!start) {
      start = Date.now();
      window.localStorage.setItem(key, String(start));
    }
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [dayId, key]);

  const clear = () => window.localStorage.removeItem(key);
  return { elapsed, clear };
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

type RestState = { endsAt: number; total: number; label: string };

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const [completedSets, setCompletedSets] = useLocalStorage<ProgressMap>(PROGRESS_KEY, {});
  const [restOverrides, setRestOverrides] = useLocalStorage<Record<string, number>>(REST_OVERRIDES_KEY, {});
  const { elapsed, clear } = useSessionTimer(id);

  const [rest, setRest] = useState<RestState | null>(null);
  const [restRemaining, setRestRemaining] = useState(0);
  const [setTypeTarget, setSetTypeTarget] = useState<{ exercise: Exercise; setIndex: number } | null>(null);
  const [restTarget, setRestTarget] = useState<Exercise | null>(null);
  const [justCompleted, setJustCompleted] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState(notificationPermission());

  // Rest countdown
  useEffect(() => {
    if (!rest) return;
    const tick = () => {
      const remaining = Math.ceil((rest.endsAt - Date.now()) / 1000);
      if (remaining <= 0) {
        setRest(null);
        hapticRestOver();
        playRestOver();
        if (document.visibilityState !== 'visible') void notifyRestOver(rest.label);
      } else {
        setRestRemaining(remaining);
      }
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [rest]);

  // Find the day across all weeks
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
        <button onClick={() => navigate('/')} className="text-white font-bold underline">
          Back to programme
        </button>
      </div>
    );
  }

  const progress = getDayProgress(day, completedSets);
  const volume = getDayVolume(day, completedSets);

  const restFor = (exercise: Exercise) => restOverrides[exercise.name] ?? exercise.restSec;

  const finishWorkout = () => {
    clear();
    if (progress.completed === 0) {
      hapticTap();
      navigate(`/week/${weekNum}`);
      return;
    }
    unlockAudio();
    hapticWorkoutDone();
    playWorkoutDone();
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
        setRestRemaining(restSec);
        setRest({ endsAt: Date.now() + restSec * 1000, total: restSec, label: exercise.name });
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
            <h1 className="font-bold tracking-[-0.02em] leading-tight truncate">
              {day.title.split(': ')[1] || day.title}
            </h1>
            <p className="text-[0.6875rem] font-medium text-mist">
              Week {weekNum} · Day {day.title.split(':')[0].replace('Day ', '')}
            </p>
          </div>
          <button
            onClick={finishWorkout}
            className="flex-shrink-0 bg-mint text-court-deep font-bold text-sm px-5 py-2.5 rounded-full transition-transform active:scale-95"
          >
            Finish
          </button>
        </div>
        {/* header progress bar */}
        <div className="h-1 bg-court-deep">
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
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <Stat label="Duration" value={formatElapsed(elapsed)} accent="text-mint" />
          <Stat label="Volume" value={`${Math.round(volume).toLocaleString()} kg`} pop />
          <Stat label="Sets" value={`${progress.completed}/${progress.total}`} pop />
        </motion.div>

        <div className="space-y-10">
          {day.exercises.map((exercise, index) => (
            <motion.section
              key={exercise.id}
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: Math.min(index * 0.07, 0.35), ease: 'easeOut' }}
            >
              <ExerciseSection
                exercise={exercise}
                index={index}
                weekNum={weekNum}
                restSec={restFor(exercise)}
                completedSets={completedSets}
                justCompleted={justCompleted}
                toggleSet={toggleSet}
                updateSetLog={updateSetLog}
                getPreviousSetLog={getPreviousSetLog}
                onPickSetType={(setIndex) => setSetTypeTarget({ exercise, setIndex })}
                onConfigureRest={() => setRestTarget(exercise)}
              />
            </motion.section>
          ))}
        </div>
      </main>

      {/* Rest countdown bar */}
      <AnimatePresence>
        {rest && (
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
                    setRest((r) => (r ? { ...r, endsAt: r.endsAt + 15000, total: r.total + 15 } : r));
                  }}
                  className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-xs font-bold px-3 py-2 rounded-full transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> 15s
                </button>
                <button
                  onClick={() => {
                    hapticTap();
                    setRest(null);
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
        <div className="space-y-1">
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
                  'w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left transition-colors',
                  selected ? 'bg-white/15' : 'hover:bg-white/10'
                )}
              >
                <span className={cn('w-6 text-center text-lg font-bold', option.color)}>{option.letter}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-sm">{option.label}</span>
                  <span className="block text-xs text-mist">{option.hint}</span>
                </span>
                {selected && <Check className="w-4 h-4 text-mint flex-shrink-0" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* Rest config sheet */}
      <BottomSheet
        open={restTarget !== null}
        onClose={() => setRestTarget(null)}
        title={restTarget ? `Rest timer · ${restTarget.name}` : 'Rest timer'}
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
                  'py-3 rounded-xl font-bold text-sm tabular-nums transition-colors',
                  selected ? 'bg-mint text-court-deep' : 'bg-white/10 hover:bg-white/20'
                )}
              >
                {seconds === 0 ? 'Off' : formatElapsed(seconds)}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-mist text-center mt-4">
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
    </div>
  );
}

const Stat: React.FC<{ label: string; value: string; accent?: string; pop?: boolean }> = ({
  label,
  value,
  accent,
  pop,
}) => (
  <div className="bg-white/10 rounded-2xl px-3 py-3">
    <p className="text-[0.625rem] font-bold uppercase tracking-[0.15em] text-mist">{label}</p>
    {pop ? (
      <motion.p
        key={value}
        initial={{ scale: 1.25 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        className={cn('text-lg font-bold tabular-nums tracking-[-0.02em] mt-0.5 origin-left', accent)}
      >
        {value}
      </motion.p>
    ) : (
      <p className={cn('text-lg font-bold tabular-nums tracking-[-0.02em] mt-0.5', accent)}>{value}</p>
    )}
  </div>
);

const ExerciseSection: React.FC<{
  exercise: Exercise;
  index: number;
  weekNum: number;
  restSec: number;
  completedSets: ProgressMap;
  justCompleted: string | null;
  toggleSet: (exercise: Exercise, setIndex: number) => void;
  updateSetLog: (exerciseId: string, setIndex: number, field: 'weight' | 'actualReps' | 'timeSec', value: string) => void;
  getPreviousSetLog: (exerciseName: string, currentWeekNum: number, setIndex: number) => SetLog | null;
  onPickSetType: (setIndex: number) => void;
  onConfigureRest: () => void;
}> = ({
  exercise,
  index,
  weekNum,
  restSec,
  completedSets,
  justCompleted,
  toggleSet,
  updateSetLog,
  getPreviousSetLog,
  onPickSetType,
  onConfigureRest,
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
        <h2 className="text-xl font-bold tracking-[-0.02em] leading-snug">
          {index + 1}. {exercise.name}
        </h2>
        <span className="flex-shrink-0 bg-white text-court text-xs font-bold px-2.5 py-1 rounded-md whitespace-nowrap mt-0.5">
          {exercise.sets} × {exercise.reps}
        </span>
      </div>
      {exercise.load && <p className="text-sm font-bold text-zest mb-1">{exercise.load}</p>}
      {exercise.notes && <p className="text-sm text-mist leading-relaxed mb-1">{exercise.notes}</p>}

      {/* Rest timer config */}
      <button
        onClick={() => {
          hapticTap();
          onConfigureRest();
        }}
        className="flex items-center gap-1.5 text-sm font-bold text-mint py-1.5 -ml-0.5 hover:opacity-80 transition-opacity"
      >
        <Timer className="w-4 h-4" />
        Rest timer: {restSec === 0 ? 'Off' : formatElapsed(restSec)}
      </button>

      {/* Table header */}
      <div className="grid grid-cols-12 gap-2 mt-3 mb-2 px-1 text-[0.625rem] font-bold text-mist uppercase tracking-[0.12em] text-center">
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
            log.completed && 'bg-transparent'
          );

          return (
            <div
              key={setIndex}
              className={cn(
                'grid grid-cols-12 gap-2 items-center px-1 py-1.5 rounded-xl transition-colors',
                log.completed && 'bg-mint/20'
              )}
            >
              <button
                onClick={() => {
                  hapticTap();
                  onPickSetType(setIndex);
                }}
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
                      placeholder="—"
                      value={log.weight || ''}
                      onChange={(e) => updateSetLog(exercise.id, setIndex, 'weight', e.target.value)}
                      disabled={log.completed}
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder={exercise.reps.replace(/[^0-9-]/g, '') || '—'}
                      value={log.actualReps || ''}
                      onChange={(e) => updateSetLog(exercise.id, setIndex, 'actualReps', e.target.value)}
                      disabled={log.completed}
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
                    placeholder={exercise.reps.replace(/[^0-9-]/g, '') || '—'}
                    value={log.actualReps || ''}
                    onChange={(e) => updateSetLog(exercise.id, setIndex, 'actualReps', e.target.value)}
                    disabled={log.completed}
                    className={inputClass}
                  />
                </div>
              )}

              {tracking === 'time' && (
                <div className="col-span-5">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="—"
                    value={log.timeSec || ''}
                    onChange={(e) => updateSetLog(exercise.id, setIndex, 'timeSec', e.target.value)}
                    disabled={log.completed}
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
