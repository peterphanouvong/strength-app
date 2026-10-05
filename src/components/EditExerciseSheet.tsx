import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Exercise, WorkoutDay, Tracking } from '../data';
import { BottomSheet } from './BottomSheet';
import { cn } from '../lib/utils';
import { hapticSelect, hapticTap } from '../lib/feedback';
import { PROGRESS_KEY } from '../lib/progress';
import { EditOp } from '../lib/programme/ops';
import { applyOps } from '../lib/programme/engine';
import { applyEdits, getProgramme } from '../lib/programme/store';
import { formatElapsed } from '../lib/time';

const REST_CHOICES = [0, 30, 60, 90, 120, 150, 180, 240, 300];
const TRACKING_CHOICES: { id: Tracking; label: string }[] = [
  { id: 'weighted', label: 'Weight + reps' },
  { id: 'reps', label: 'Reps only' },
  { id: 'time', label: 'Time' },
];

/** Edit one exercise, or add one (exercise === null). All changes go through applyEdits. */
export const EditExerciseSheet: React.FC<{
  day: WorkoutDay;
  exercise: Exercise | null;
  open: boolean;
  onClose: () => void;
}> = ({ day, exercise, open, onClose }) => {
  const [name, setName] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('');
  const [load, setLoad] = useState('');
  const [notes, setNotes] = useState('');
  const [restSec, setRestSec] = useState(90);
  const [tracking, setTracking] = useState<Tracking>('weighted');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever the sheet opens for a target.
  useEffect(() => {
    if (!open) return;
    setConfirmRemove(null);
    setError(null);
    setName(exercise?.name ?? '');
    setSets(String(exercise?.sets ?? 3));
    setReps(exercise?.reps ?? '');
    setLoad(exercise?.load ?? '');
    setNotes(exercise?.notes ?? '');
    setRestSec(exercise?.restSec ?? 90);
    setTracking(exercise?.tracking ?? 'weighted');
  }, [open, exercise]);

  const submit = () => {
    hapticSelect();
    const setsNum = parseInt(sets, 10);
    if (!name.trim() || !reps.trim() || !(setsNum >= 1)) {
      setError('Name, sets and reps are required.');
      return;
    }
    const ops: EditOp[] = exercise
      ? [{
          type: 'update-exercise',
          exerciseId: exercise.id,
          patch: { name: name.trim(), sets: setsNum, reps: reps.trim(), load: load.trim() || undefined, notes: notes.trim() || undefined, tracking, restSec },
        }]
      : [{
          type: 'add-exercise',
          dayId: day.id,
          exercise: { name: name.trim(), sets: setsNum, reps: reps.trim(), load: load.trim() || undefined, notes: notes.trim() || undefined, tracking, restSec },
        }];
    const res = applyEdits(ops);
    if (res.ok === false) {
      setError(res.errors[0].message);
      return;
    }
    onClose();
  };

  const remove = (force: boolean) => {
    if (!exercise) return;
    hapticTap();
    const ops: EditOp[] = [{ type: 'remove-exercise', exerciseId: exercise.id }];
    if (!force) {
      // Dry-run against the current programme to surface warnings before applying.
      const progressRaw = window.localStorage.getItem(PROGRESS_KEY);
      const progress = progressRaw ? JSON.parse(progressRaw) : {};
      const dry = applyOps(getProgramme(), ops, progress);
      if (dry.ok && dry.warnings.length > 0) {
        setConfirmRemove(dry.warnings[0].message);
        return;
      }
      if (dry.ok === false) {
        setError(dry.errors[0].message);
        return;
      }
    }
    const res = applyEdits(ops);
    if (res.ok === false) {
      setError(res.errors[0].message);
      return;
    }
    onClose();
  };

  const move = (dir: -1 | 1) => {
    if (!exercise) return;
    hapticTap();
    const idx = day.exercises.findIndex((e) => e.id === exercise.id);
    applyEdits([{ type: 'reorder-exercise', exerciseId: exercise.id, toIndex: Math.max(0, idx + dir) }]);
    onClose();
  };

  const field = 'w-full bg-ink/10 rounded-xl px-3.5 py-3 text-base font-bold text-ink focus:outline-none focus:ring-2 focus:ring-primary';
  const label = 'block text-[0.6875rem] font-bold text-secondary mb-1.5';

  return (
    <BottomSheet open={open} onClose={onClose} title={exercise ? 'Edit exercise' : 'Add exercise'} subtitle={exercise?.name}>
      <div className="space-y-4 max-h-[65vh] overflow-y-auto -mx-1 px-1">
        <div>
          <label htmlFor="edit-name" className={label}>Name</label>
          <input id="edit-name" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          {exercise && name.trim() && name.trim() !== exercise.name && (
            <p className="text-xs text-accent mt-1.5">Renaming starts fresh history — past logs and bests stay under "{exercise.name}".</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-sets" className={label}>Sets</label>
            <input id="edit-sets" aria-label="Sets" type="number" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="edit-reps" className={label}>Reps</label>
            <input id="edit-reps" aria-label="Reps" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="6-8" className={field} />
          </div>
        </div>
        <div>
          <label htmlFor="edit-load" className={label}>Load</label>
          <input id="edit-load" aria-label="Load" value={load} onChange={(e) => setLoad(e.target.value)} placeholder="70% TM, RPE 7, Bodyweight…" className={field} />
        </div>
        <div>
          <label htmlFor="edit-notes" className={label}>Notes</label>
          <input id="edit-notes" aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
        </div>
        <div>
          <span className={label}>Tracking</span>
          <div className="flex gap-2">
            {TRACKING_CHOICES.map((t) => (
              <button key={t.id} onClick={() => { hapticTap(); setTracking(t.id); }}
                className={cn('px-3 py-2 rounded-full text-xs font-bold transition-colors', tracking === t.id ? 'bg-ink text-surface' : 'bg-ink/10 text-secondary hover:bg-ink/20')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={label}>Rest</span>
          <div className="grid grid-cols-3 gap-2">
            {REST_CHOICES.map((s) => (
              <button key={s} onClick={() => { hapticTap(); setRestSec(s); }}
                className={cn('py-2.5 rounded-xl font-bold text-sm tabular-nums transition-colors', restSec === s ? 'bg-primary text-onfill' : 'bg-ink/10 hover:bg-ink/20')}>
                {s === 0 ? 'Off' : formatElapsed(s)}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm font-bold text-danger">{error}</p>}

        <button onClick={submit} className="w-full bg-primary text-onfill font-bold text-sm py-3.5 rounded-xl transition-transform active:scale-[0.98]">
          {exercise ? 'Save changes' : 'Add exercise'}
        </button>

        {exercise && (
          <>
            <div className="flex gap-2">
              <button onClick={() => move(-1)} className="flex-1 flex items-center justify-center gap-1.5 bg-ink/10 hover:bg-ink/20 font-bold text-sm py-3 rounded-xl transition-colors">
                <ArrowUp className="w-4 h-4" /> Move up
              </button>
              <button onClick={() => move(1)} className="flex-1 flex items-center justify-center gap-1.5 bg-ink/10 hover:bg-ink/20 font-bold text-sm py-3 rounded-xl transition-colors">
                <ArrowDown className="w-4 h-4" /> Move down
              </button>
            </div>
            {confirmRemove ? (
              <div className="bg-danger/10 rounded-xl px-4 py-3.5">
                <p className="text-sm font-bold text-danger text-center mb-3">{confirmRemove}</p>
                <button onClick={() => remove(true)} className="w-full bg-danger text-ink font-bold text-sm py-3.5 rounded-xl transition-transform active:scale-[0.98]">
                  Remove anyway
                </button>
              </div>
            ) : (
              <button onClick={() => remove(false)} className="w-full bg-ink/10 hover:bg-ink/20 text-danger font-bold text-sm py-3.5 rounded-xl transition-colors">
                Remove exercise
              </button>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
};
