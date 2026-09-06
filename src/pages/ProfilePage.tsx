import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Check, ChevronRight, Medal } from 'lucide-react';
import {
  hapticTap,
  hapticSelect,
  notificationsSupported,
  notificationPermission,
  requestNotifications,
} from '../lib/feedback';
import { THEMES, applyTheme, getSavedThemeId } from '../lib/themes';
import { BottomSheet } from '../components/BottomSheet';
import { cn } from '../lib/utils';
import { useEntranceOnce } from '../lib/animation';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
  coerceHistory,
  getWeekStreak,
  workoutDisplayTitle,
  CompletedWorkout,
  HISTORY_KEY,
} from '../lib/history';
import { getBests, listPrs } from '../lib/bests';
import { MonthCalendar } from '../components/MonthCalendar';
import { formatElapsed } from './WorkoutPage';

function formatDate(t: number): string {
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ProfilePage() {
  const reduceMotion = useReducedMotion();
  const entered = useEntranceOnce('profile');
  const [notifPerm, setNotifPerm] = useState(notificationPermission());
  const [themeId, setThemeId] = useState(getSavedThemeId);
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  const currentTheme = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const [historyRaw] = useLocalStorage<CompletedWorkout[]>(HISTORY_KEY, []);
  const history = coerceHistory(historyRaw);
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const streak = getWeekStreak(history);
  const recentFirst = [...history].sort((a, b) => b.completedAt - a.completedAt);
  const [prs] = useState(() => listPrs(getBests()));

  const rise = (delay: number) => ({
    initial: reduceMotion || !entered ? false : ({ opacity: 0, y: 16 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay, ease: 'easeOut' as const },
  });

  return (
    <div className="min-h-screen">
      <main className="max-w-xl mx-auto px-5 pt-10 pb-32">
        <motion.header className="mb-8" {...rise(0)}>
          <p className="text-sm font-bold text-accent mb-3">Volleyball Strength</p>
          <h1 className="text-[3.25rem] leading-[0.95] font-bold tracking-[-0.035em]">Profile</h1>
          <p className="text-sm text-secondary mt-4">Your training and settings, all local.</p>
        </motion.header>

        <motion.section {...rise(0.08)}>
          <MonthCalendar monthDate={monthDate} history={history} onNavigate={setMonthDate} />
          {streak > 0 && (
            <p className="text-base font-bold text-accent mt-3.5 text-center">
              🔥 <span className="text-danger">{streak} week streak</span>
            </p>
          )}
        </motion.section>

        <motion.section className="mt-8" {...rise(0.14)}>
          <h2 className="text-lg font-bold tracking-[-0.02em]">History</h2>
          {recentFirst.length === 0 ? (
            <p className="text-sm text-secondary leading-relaxed mt-1.5">
              No workouts saved yet — finish a session and it'll show up here.
            </p>
          ) : (
            <ul
              aria-label="Workout history"
              className="bg-ink/5 rounded-2xl divide-y divide-ink/[0.06] overflow-hidden mt-3"
            >
              {recentFirst.map((entry) => (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-bold tracking-[-0.02em] min-w-0 truncate">
                      {workoutDisplayTitle(entry)}
                    </p>
                    <p className="text-xs font-medium text-secondary tabular-nums flex-shrink-0">
                      {formatDate(entry.completedAt)}
                    </p>
                  </div>
                  <p className="text-xs text-secondary tabular-nums mt-0.5">
                    Week {entry.weekNum} · {formatElapsed(entry.elapsed)} ·{' '}
                    {Math.round(entry.volume).toLocaleString()} kg · {entry.setsDone}/{entry.totalSets}{' '}
                    sets
                  </p>
                  {entry.note && (
                    <p className="text-xs text-ink/80 leading-relaxed mt-1">{entry.note}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        {prs.length > 0 && (
          <motion.section className="mt-8" {...rise(0.18)}>
            <h2 className="text-lg font-bold tracking-[-0.02em]">Personal bests</h2>
            <ul
              aria-label="Personal bests"
              className="bg-ink/5 rounded-2xl divide-y divide-ink/[0.06] overflow-hidden mt-3"
            >
              {prs.map((pr) => (
                <li key={`${pr.exercise}-${pr.label}`}>
                  <Link
                    to={`/exercise/${encodeURIComponent(pr.exercise)}`}
                    onClick={hapticTap}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-ink/5 transition-colors"
                  >
                    <Medal className="w-4 h-4 text-accent flex-shrink-0" />
                    <p className="font-bold tracking-[-0.02em] text-sm min-w-0 truncate flex-1">
                      {pr.exercise}
                    </p>
                    <p className="text-sm font-bold text-accent tabular-nums flex-shrink-0">{pr.label}</p>
                    <ChevronRight className="w-4 h-4 text-secondary flex-shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        <motion.section className="border-t border-dashed border-ink/25 pt-6 mt-8" {...rise(0.2)}>
          <h2 className="text-lg font-bold tracking-[-0.02em]">Preferences</h2>
          <div className="bg-ink/5 rounded-2xl divide-y divide-ink/[0.06] overflow-hidden mt-3">
            {/* Theme */}
            <button
              onClick={() => {
                hapticTap();
                setThemeSheetOpen(true);
              }}
              className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left hover:bg-ink/5 transition-colors"
            >
              <span className="font-bold text-sm">Theme</span>
              <span className="flex items-center gap-2 flex-shrink-0">
                <span className="flex gap-1" aria-hidden>
                  <span className="w-3.5 h-3.5 rounded-full border border-ink/25" style={{ backgroundColor: currentTheme.vars.surface }} />
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: currentTheme.vars.primary }} />
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: currentTheme.vars.accent }} />
                </span>
                <span className="text-sm font-medium text-secondary">{currentTheme.name}</span>
                <ChevronRight className="w-4 h-4 text-secondary" />
              </span>
            </button>

            {/* Rest notifications */}
            <div className="px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-sm">Rest notifications</span>
                {!notificationsSupported() ? (
                  <span className="text-xs text-secondary">Not supported</span>
                ) : notifPerm === 'granted' ? (
                  <span className="text-xs font-bold text-primary">On</span>
                ) : notifPerm === 'denied' ? (
                  <span className="text-xs text-secondary">Blocked in settings</span>
                ) : (
                  <button
                    onClick={async () => {
                      hapticTap();
                      setNotifPerm(await requestNotifications());
                    }}
                    className="bg-ink/10 hover:bg-ink/20 font-bold text-xs px-3.5 py-2 rounded-full transition-colors"
                  >
                    Turn on
                  </button>
                )}
              </div>
              <p className="text-xs text-secondary leading-relaxed mt-1">
                Get an alert when a rest timer ends, even in the background.
              </p>
            </div>
          </div>
        </motion.section>

        {/* Theme sheet */}
        <BottomSheet open={themeSheetOpen} onClose={() => setThemeSheetOpen(false)} title="Theme">
          <div className="grid grid-cols-2 gap-3">
            {THEMES.map((theme) => {
              const selected = theme.id === themeId;
              return (
                <button
                  key={theme.id}
                  aria-pressed={selected}
                  onClick={() => {
                    hapticSelect();
                    applyTheme(theme.id);
                    setThemeId(theme.id);
                  }}
                  className={cn(
                    'rounded-2xl p-4 text-left border transition-colors',
                    selected ? 'border-primary' : 'border-ink/15 hover:border-ink/30'
                  )}
                  style={{ backgroundColor: theme.vars.surface }}
                >
                  {/* Mini preview: ground + accent bar + type, in the theme's own colors */}
                  <span className="block h-2 w-12 rounded-full" style={{ backgroundColor: theme.vars.primary }} />
                  <span className="block h-2 w-8 rounded-full mt-1.5" style={{ backgroundColor: theme.vars.accent }} />
                  <span
                    className="block h-1.5 w-16 rounded-full mt-1.5"
                    style={{ backgroundColor: theme.vars.secondary, opacity: 0.6 }}
                  />
                  <span className="flex items-center justify-between mt-4">
                    <span className="font-bold text-sm" style={{ color: theme.vars.ink }}>{theme.name}</span>
                    {selected && <Check className="w-4 h-4" style={{ color: theme.vars.primary }} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-secondary text-center mt-4">
            Applies everywhere, instantly. Saved on this device.
          </p>
        </BottomSheet>
      </main>
    </div>
  );
}
