import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { CompletedWorkout, getMonthGrid } from '../lib/history';
import { hapticTap } from '../lib/feedback';

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Month grid of saved workouts: mint discs on saved days, a ring on today.
 * Pass `onNavigate` (Profile) for prev/next month arrows; without it (congrats)
 * the calendar is a fixed view of the given month.
 */
export const MonthCalendar: React.FC<{
  monthDate: Date;
  history: CompletedWorkout[];
  onNavigate?: (next: Date) => void;
}> = ({ monthDate, history, onNavigate }) => {
  const grid = getMonthGrid(monthDate, history);
  const label = monthDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const shift = (delta: number) => {
    hapticTap();
    onNavigate?.(new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1));
  };

  return (
    <div className="bg-white/10 rounded-2xl px-4 py-4" role="group" aria-label={`Calendar · ${label}`}>
      <div className="flex items-center justify-between mb-3">
        {onNavigate ? (
          <button
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-8" aria-hidden />
        )}
        <p className="font-bold tracking-[-0.02em]">{label}</p>
        {onNavigate ? (
          <button
            onClick={() => shift(1)}
            aria-label="Next month"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-8" aria-hidden />
        )}
      </div>

      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {DAY_INITIALS.map((d, i) => (
          <span key={i} className="text-[0.625rem] font-bold text-mist" aria-hidden>
            {d}
          </span>
        ))}
        {grid.flat().map((cell) => (
          <span
            key={cell.date.getTime()}
            data-saved={(cell.inMonth && cell.saved) || undefined}
            data-today={(cell.inMonth && cell.today) || undefined}
            aria-label={
              cell.inMonth && cell.saved
                ? `${cell.date.getDate()} ${label} · workout saved`
                : undefined
            }
            className={cn(
              'w-8 h-8 mx-auto rounded-full flex items-center justify-center text-xs font-bold tabular-nums',
              !cell.inMonth && 'text-white/20',
              cell.inMonth && (cell.saved ? 'bg-mint text-court-deep' : 'text-white/80'),
              cell.inMonth && cell.today && 'ring-2 ring-white/70'
            )}
          >
            {cell.date.getDate()}
          </span>
        ))}
      </div>
    </div>
  );
};
