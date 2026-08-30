import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Check } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { TRAINING_PLAN, WeekPlan } from '../data';
import { cn } from '../lib/utils';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { PROGRESS_KEY, ProgressMap, getWeekProgress } from '../lib/progress';

type BlockGroup = {
  name: string; // e.g. "Rebuild"
  numeral: string; // e.g. "1"
  range: string;
  weeks: WeekPlan[];
};

function groupByBlock(): BlockGroup[] {
  const groups: BlockGroup[] = [];
  for (const week of TRAINING_PLAN) {
    const numeral = week.block.charAt(0);
    const name = week.block.substring(4);
    let group = groups.find((g) => g.name === name);
    if (!group) {
      group = { name, numeral, range: '', weeks: [] };
      groups.push(group);
    }
    group.weeks.push(week);
  }
  groups.forEach((g) => {
    g.range = `Weeks ${g.weeks[0].weekNumber}–${g.weeks[g.weeks.length - 1].weekNumber}`;
  });
  return groups;
}

const BLOCK_TAGLINES: Record<string, string> = {
  Rebuild: 'Volume-led. Leave something in the tank.',
  Load: 'Heavier, shorter sets. Rest 3 min on main lifts.',
  Convert: 'Strength is banked. Now the job is speed.',
};

export const BLOCK_TEXT_COLOR: Record<string, string> = {
  Rebuild: 'text-flame',
  Load: 'text-zest',
  Convert: 'text-mint',
};

export default function WeeksPage() {
  const [completedSets] = useLocalStorage<ProgressMap>(PROGRESS_KEY, {});
  const reduceMotion = useReducedMotion();
  const blocks = groupByBlock();

  const rise = (delay: number) => ({
    initial: reduceMotion ? false : ({ opacity: 0, y: 16 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay, ease: 'easeOut' as const },
  });

  return (
    <div className="min-h-screen">
      <main className="max-w-xl mx-auto px-5 pt-10 pb-16">
        {/* Hero */}
        <motion.header className="mb-10" {...rise(0)}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-mist mb-3">
            Volleyball Strength
          </p>
          <h1 className="text-[2.75rem] leading-[0.95] font-bold tracking-[-0.03em]">
            12-week
            <br />
            programme
          </h1>
          <p className="text-sm text-mist mt-3">
            Strength &amp; power for volleyball. Pick a week to train.
          </p>
        </motion.header>

        {/* Blocks */}
        <div className="space-y-12">
          {blocks.map((block, blockIndex) => (
            <section key={block.name}>
              <motion.div {...rise(0.1 + blockIndex * 0.08)}>
                <h2
                  className={cn(
                    'text-4xl font-bold uppercase tracking-[-0.04em] leading-none',
                    BLOCK_TEXT_COLOR[block.name]
                  )}
                >
                  {block.name}
                </h2>
                <p className="text-xs font-medium text-mist mt-2 mb-4">
                  Block {block.numeral} · {block.range} · {BLOCK_TAGLINES[block.name]}
                </p>
              </motion.div>

              <div className="space-y-3">
                {block.weeks.map((week, weekIndex) => (
                  <motion.div key={week.id} {...rise(0.15 + blockIndex * 0.08 + weekIndex * 0.05)}>
                    <WeekRow week={week} completedSets={completedSets} />
                  </motion.div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

const WeekRow: React.FC<{ week: WeekPlan; completedSets: ProgressMap }> = ({ week, completedSets }) => {
  const progress = getWeekProgress(week, completedSets);
  const done = progress.total > 0 && progress.percentage === 100;

  return (
    <Link
      to={`/week/${week.weekNumber}`}
      className="block bg-white/10 rounded-2xl px-5 py-4 transition-transform active:scale-[0.98] hover:bg-white/15"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold tracking-[-0.02em]">Week {week.weekNumber}</h3>
          <p className="text-xs text-mist truncate mt-0.5">{week.focus}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {done ? (
            <span className="w-8 h-8 rounded-full bg-mint text-court-deep flex items-center justify-center">
              <Check className="w-4 h-4" strokeWidth={3} />
            </span>
          ) : progress.percentage > 0 ? (
            <span className="text-sm font-bold text-mint tabular-nums">{progress.percentage}%</span>
          ) : null}
          <ChevronRight className="w-5 h-5 text-mist" />
        </div>
      </div>
      <div className={cn('mt-3 h-2 rounded-full bg-court-deep/60 overflow-hidden', progress.percentage === 0 && 'opacity-60')}>
        <div
          className="h-full rounded-full bg-mint transition-all duration-500"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
    </Link>
  );
};
