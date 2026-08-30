import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Check, Play } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { TRAINING_PLAN, IN_SEASON_ADJUSTMENTS, WorkoutDay } from '../data';
import { cn } from '../lib/utils';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { PROGRESS_KEY, ProgressMap, getDayProgress } from '../lib/progress';
import { BLOCK_TEXT_COLOR } from './WeeksPage';

// Poster panel palettes, cycled per day
const POSTERS = [
  'bg-zest text-court-deep',
  'bg-mint text-court-deep',
  'bg-white text-court',
  'bg-mist text-court-deep',
];

function posterWords(title: string): string[] {
  const name = (title.split(': ')[1] || title).split(' (')[0].split(' + ')[0];
  return name.toUpperCase().split(' ');
}

export default function WeekOverview() {
  const { weekNumber } = useParams<{ weekNumber: string }>();
  const navigate = useNavigate();
  const [completedSets] = useLocalStorage<ProgressMap>(PROGRESS_KEY, {});

  const week = TRAINING_PLAN.find((w) => w.weekNumber === Number(weekNumber));

  if (!week) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-mist">Week not found.</p>
        <Link to="/" className="text-white font-bold underline">
          Back to programme
        </Link>
      </div>
    );
  }

  const blockName = week.block.substring(4);

  return (
    <div className="min-h-screen">
      <main className="max-w-xl mx-auto px-5 pt-6 pb-16">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/')}
            aria-label="Back to programme"
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-mist">
            Block {week.block.charAt(0)} · {blockName}
          </span>
        </div>

        {/* Title */}
        <header className="mb-8">
          <h1 className="text-[2.5rem] leading-none font-bold tracking-[-0.03em] mb-1">
            Week {week.weekNumber}
          </h1>
          <h2
            className={cn(
              'text-2xl font-bold tracking-[-0.02em] uppercase',
              BLOCK_TEXT_COLOR[blockName]
            )}
          >
            {blockName}
          </h2>
          <WeekInfoTabs week={week} />
          <div className="border-t border-dashed border-white/30 mt-5" />
        </header>

        {/* Day cards */}
        <div className="space-y-4">
          {week.days.map((day, index) => (
            <DayCard key={day.id} day={day} index={index} completedSets={completedSets} />
          ))}
        </div>
        <p className="text-center text-[0.6875rem] font-medium text-mist mt-5">
          Tap a session to start the workout.
        </p>

      </main>
    </div>
  );
}

type InfoTab = 'week' | 'goal' | 'jumps' | 'season';

const INFO_TABS: { id: InfoTab; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'goal', label: 'Block goal' },
  { id: 'jumps', label: 'Jumps' },
  { id: 'season', label: 'In-season' },
];

const WeekInfoTabs: React.FC<{ week: (typeof TRAINING_PLAN)[number] }> = ({ week }) => {
  const [active, setActive] = useState<InfoTab>('week');

  return (
    <div className="mt-4">
      <div className="flex gap-2 flex-wrap">
        {INFO_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors',
              active === tab.id ? 'bg-white text-court' : 'bg-white/10 text-mist hover:bg-white/20'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          className="mt-3 text-sm leading-relaxed"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {active === 'week' && <p className="text-white font-medium">{week.focus}</p>}
          {active === 'goal' && <p className="text-mist">{week.blockNote}</p>}
          {active === 'jumps' && <p className="text-mist">{week.jumpsNote}</p>}
          {active === 'season' && (
            <div className="space-y-3">
              <p className="text-xs text-mist">
                If you're on court 3+ times a week, or the comp calendar tightens:
              </p>
              {IN_SEASON_ADJUSTMENTS.map((adj) => (
                <div key={adj.title}>
                  <p className="font-bold text-zest">{adj.title}</p>
                  <p className="text-mist">{adj.body}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

const DayCard: React.FC<{ day: WorkoutDay; index: number; completedSets: ProgressMap }> = ({
  day,
  index,
  completedSets,
}) => {
  const reduceMotion = useReducedMotion();
  const progress = getDayProgress(day, completedSets);
  const done = progress.total > 0 && progress.percentage === 100;
  const started = progress.completed > 0 && !done;
  const [letter, name] = day.title.split(': ');
  const words = posterWords(day.title);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 + index * 0.07, ease: 'easeOut' }}
    >
    <Link
      to={`/workout/${day.id}`}
      className="flex bg-white/10 rounded-2xl overflow-hidden transition-transform active:scale-[0.98] hover:bg-white/15"
    >
      {/* Poster panel */}
      <div
        className={cn(
          'w-28 flex-shrink-0 px-3 py-4 flex flex-col justify-center',
          POSTERS[index % POSTERS.length]
        )}
      >
        {words.map((word) => (
          <span
            key={word}
            className="block text-[0.9375rem] font-bold uppercase leading-[1.1] tracking-[-0.02em]"
          >
            {word}
          </span>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.18em] text-mist">
            {letter}
          </p>
          {done ? (
            <span className="w-6 h-6 rounded-full bg-mint text-court-deep flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
            </span>
          ) : (
            <span
              className={cn(
                'flex items-center gap-1 text-[0.6875rem] font-bold px-2.5 py-1 rounded-full flex-shrink-0',
                started ? 'bg-zest text-court-deep' : 'bg-mint text-court-deep'
              )}
            >
              <Play className="w-3 h-3 fill-current" />
              {started ? 'Resume' : 'Start'}
            </span>
          )}
        </div>
        <h3 className="text-[1.0625rem] font-bold tracking-[-0.02em] leading-snug mt-0.5 truncate">
          {name}
        </h3>
        <p className="text-xs text-mist mt-1">
          {day.exercises.length} exercises · {progress.total} sets
        </p>
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 h-2 rounded-full bg-court-deep/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-mint transition-all duration-500"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <span className="text-[0.6875rem] font-bold text-mist tabular-nums">
            {progress.completed}/{progress.total}
          </span>
        </div>
      </div>
    </Link>
    </motion.div>
  );
};
