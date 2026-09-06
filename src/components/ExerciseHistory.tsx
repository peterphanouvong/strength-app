import React from 'react';
import { TRAINING_PLAN, Exercise } from '../data';
import { ProgressMap, SetType } from '../lib/progress';
import { cn } from '../lib/utils';

export const SET_TYPE_COLOR: Record<SetType, string> = { W: 'text-accent', F: 'text-danger', D: 'text-secondary' };

/**
 * Week-by-week logged history for one exercise (matched by name across the
 * whole plan), with the top-weight progression chart when there's enough data.
 * Shared between the in-workout history sheet and the exercise detail page —
 * consumers own scrolling/layout around it.
 */
export const ExerciseHistory: React.FC<{ exercise: Exercise; completedSets: ProgressMap }> = ({
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
      <p className="text-sm text-secondary text-center py-6">
        No sets logged yet — your history with this exercise builds as you train.
      </p>
    );
  }

  const chartPoints = entries.filter((e) => e.topWeight > 0);
  const recentFirst = [...entries].reverse();

  return (
    <div>
      {exercise.tracking === 'weighted' && chartPoints.length >= 2 && (
        <TopWeightChart points={chartPoints.map((e) => ({ week: e.weekNumber, weight: e.topWeight }))} />
      )}
      <div className="space-y-6">
        {recentFirst.map((entry) => (
          <div key={entry.weekNumber}>
            <div className="flex items-baseline justify-between mb-2">
              <p className="font-bold tracking-[-0.02em]">Week {entry.weekNumber}</p>
              <p className="text-xs font-medium text-secondary tabular-nums">{entry.prescription}</p>
            </div>
            <div className="bg-ink/5 rounded-2xl divide-y divide-ink/[0.06] overflow-hidden">
              {entry.sets.map((s, i) => (
                <div key={i} className="flex items-center gap-3.5 px-3.5 py-2.5">
                  <span
                    className={cn(
                      'w-5 text-center text-xs font-bold tabular-nums',
                      s.setType ? SET_TYPE_COLOR[s.setType] : 'text-secondary'
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
    <div className="bg-ink/5 rounded-2xl px-4 pt-3.5 pb-1 mb-6">
      <p className="text-xs text-secondary font-medium">
        Heaviest set · <span className="text-primary font-bold">{heaviest.weight} kg</span> in week {heaviest.week}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-1">
        <defs>
          <linearGradient id="top-weight-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#top-weight-fill)" />
        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.weight)} r={i === points.length - 1 ? 5 : 3.5} fill="var(--color-primary)" />
        ))}
      </svg>
      <div className="flex justify-between text-[0.625rem] font-bold text-secondary -mt-1 pb-1">
        <span>Wk {points[0].week}</span>
        <span>Wk {last.week}</span>
      </div>
    </div>
  );
};
