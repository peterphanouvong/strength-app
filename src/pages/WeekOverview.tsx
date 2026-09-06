import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Check, Play } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { TRAINING_PLAN, IN_SEASON_ADJUSTMENTS, WorkoutDay } from '../data';
import { cn } from '../lib/utils';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { PROGRESS_KEY, ProgressMap, getDayProgress } from '../lib/progress';
import { BLOCK_TEXT_COLOR } from './WeeksPage';
import { hapticTap, hapticSelect } from '../lib/feedback';
import { useEntranceOnce } from '../lib/animation';

// Poster panel palettes, cycled per day
const POSTERS = [
  'bg-accent text-onfill',
  'bg-primary text-onfill',
  'bg-ink text-surface',
  'bg-secondary text-onfill',
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
        <p className="text-secondary">Week not found.</p>
        <Link to="/programme" className="text-ink font-bold underline">
          Back to programme
        </Link>
      </div>
    );
  }

  const blockName = week.block.substring(4);

  return (
    <div className="min-h-screen">
      <main className="max-w-xl mx-auto px-5 pt-6 pb-32">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => {
              hapticTap();
              navigate('/programme');
            }}
            aria-label="Back to programme"
            className="w-10 h-10 rounded-full bg-ink/10 hover:bg-ink/20 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-bold text-ink/70 tabular-nums">
            Block {week.block.charAt(0)} · {blockName}
          </span>
        </div>

        {/* Title */}
        <header className="mb-8">
          <h1 className="text-[3.25rem] leading-[0.95] font-bold tracking-[-0.035em] mb-1.5">
            Week {week.weekNumber}
          </h1>
          <h2
            className={cn(
              'text-2xl leading-none font-bold tracking-[-0.04em] uppercase',
              BLOCK_TEXT_COLOR[blockName]
            )}
          >
            {blockName}
          </h2>
          <WeekInfoTabs week={week} />
          <div className="border-t border-dashed border-ink/25 mt-6" />
        </header>

        {/* Day cards */}
        <div className="space-y-4">
          {week.days.map((day, index) => (
            <DayCard key={day.id} day={day} index={index} completedSets={completedSets} />
          ))}
        </div>
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
            onClick={() => {
              hapticTap();
              setActive(tab.id);
            }}
            className={cn(
              'px-3 py-2 rounded-full text-xs font-bold transition-colors',
              active === tab.id ? 'bg-ink text-surface' : 'bg-ink/10 text-secondary hover:bg-ink/20'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          className="mt-3.5 min-h-[2.5rem] text-sm leading-relaxed"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {active === 'week' && <p className="text-ink font-medium">{week.focus}</p>}
          {active === 'goal' && <p className="text-secondary">{week.blockNote}</p>}
          {active === 'jumps' && <p className="text-secondary">{week.jumpsNote}</p>}
          {active === 'season' && (
            <div className="space-y-3">
              <p className="text-xs text-secondary">
                If you're on surface 3+ times a week, or the comp calendar tightens:
              </p>
              {IN_SEASON_ADJUSTMENTS.map((adj) => (
                <div key={adj.title}>
                  <p className="font-bold text-accent">{adj.title}</p>
                  <p className="text-secondary">{adj.body}</p>
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
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const entered = useEntranceOnce('week-days');
  const progress = getDayProgress(day, completedSets);
  const done = progress.total > 0 && progress.percentage === 100;
  const started = progress.completed > 0 && !done;
  const [letter, name] = day.title.split(': ');
  const words = posterWords(day.title);

  return (
    <motion.div
      initial={reduceMotion || !entered ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 + index * 0.07, ease: 'easeOut' }}
    >
    {/* Stretched-link card: the Link covers the whole card (→ preview); the
        Start/Resume pill is a sibling button layered above it, so there are no
        nested interactive elements. */}
    <div className="relative flex bg-ink/10 rounded-2xl overflow-hidden transition-transform active:scale-[0.98] hover:bg-ink/15">
      <Link
        to={`/workout/${day.id}`}
        onClick={hapticSelect}
        aria-label={`${name} preview`}
        className="absolute inset-0 z-0"
      />
      {/* Poster panel */}
      <div
        className={cn(
          'w-[7.5rem] flex-shrink-0 px-3 py-3 flex flex-col justify-between gap-2',
          POSTERS[index % POSTERS.length]
        )}
      >
        <span className="text-xs font-bold tabular-nums opacity-60">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div>
          {words.map((word) => (
            <span
              key={word}
              className="block text-[1.125rem] font-bold uppercase leading-[1.05] tracking-[-0.03em]"
            >
              {word}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.6875rem] font-bold text-secondary">{letter}</p>
          {done ? (
            <span className="w-6 h-6 rounded-full bg-primary text-onfill flex items-center justify-center flex-shrink-0">
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
            </span>
          ) : (
            <button
              onClick={() => {
                hapticSelect();
                navigate(`/workout/${day.id}`, { state: { autostart: true } });
              }}
              aria-label={`${started ? 'Resume' : 'Start'} ${name}`}
              className={cn(
                'relative z-10 flex items-center gap-1.5 text-[0.6875rem] font-bold px-3 py-1.5 rounded-full flex-shrink-0 transition-transform active:scale-95',
                started ? 'bg-accent text-onfill' : 'bg-primary text-onfill'
              )}
            >
              <Play className="w-3 h-3 fill-current" />
              {started ? 'Resume' : 'Start'}
            </button>
          )}
        </div>
        <h3 className="text-[1.0625rem] font-bold tracking-[-0.02em] leading-snug mt-0.5 truncate">
          {name}
        </h3>
        <p className="text-xs text-secondary mt-1">
          {day.exercises.length} exercises · {progress.total} sets
        </p>
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 h-2 rounded-full bg-surface-deep/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <span
            className={cn(
              'text-[0.6875rem] font-bold tabular-nums',
              progress.completed > 0 ? 'text-primary' : 'text-secondary'
            )}
          >
            {progress.completed}/{progress.total}
          </span>
        </div>
      </div>
    </div>
    </motion.div>
  );
};
