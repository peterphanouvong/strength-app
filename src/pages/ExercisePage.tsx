import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Medal } from 'lucide-react';
import { TRAINING_PLAN, Exercise } from '../data';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { PROGRESS_KEY, ProgressMap } from '../lib/progress';
import { getBests, PersonalBest } from '../lib/bests';
import { ExerciseHistory } from '../components/ExerciseHistory';
import { hapticTap } from '../lib/feedback';

/** First plan instance of the exercise — name and tracking are stable across weeks. */
function findExercise(name: string): Exercise | undefined {
  for (const week of TRAINING_PLAN) {
    for (const day of week.days) {
      const e = day.exercises.find((x) => x.name === name);
      if (e) return e;
    }
  }
  return undefined;
}

function bestDate(at: number): string | null {
  if (!(at > 0)) return null;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function ExercisePage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [completedSets] = useLocalStorage<ProgressMap>(PROGRESS_KEY, {});

  const exerciseName = decodeURIComponent(name ?? '');
  const exercise = findExercise(exerciseName);
  const [pb] = useState<PersonalBest | undefined>(() => (exercise ? getBests()[exerciseName] : undefined));

  if (!exercise) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-secondary">Exercise not found.</p>
        <Link to="/" className="text-ink font-bold underline">
          Back to home
        </Link>
      </div>
    );
  }

  const goBack = () => {
    hapticTap();
    // Direct visits have no in-app history to pop — land on home instead.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/');
  };

  return (
    <div className="min-h-screen">
      <main className="max-w-xl mx-auto px-5 pt-6 pb-32">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={goBack}
            aria-label="Back"
            className="w-10 h-10 rounded-full bg-ink/10 hover:bg-ink/20 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs font-bold text-ink/70">Exercise</span>
        </div>

        {/* Title */}
        <header className="mb-6">
          <h1 className="text-[2.5rem] leading-[1] font-bold tracking-[-0.035em]">{exerciseName}</h1>
        </header>

        {/* Personal bests */}
        {(pb?.bestWeight || pb?.bestReps) && (
          <section className="grid grid-cols-2 gap-2 mb-8">
            {pb.bestWeight && (
              <div className="bg-ink/10 rounded-2xl px-3.5 py-3">
                <p className="text-[0.6875rem] font-bold text-secondary flex items-center gap-1.5">
                  <Medal className="w-3.5 h-3.5 text-accent" /> Best set
                </p>
                <p className="text-xl font-bold tabular-nums tracking-[-0.02em] leading-snug mt-0.5 text-accent">
                  {pb.bestWeight.weight} kg × {pb.bestWeight.reps}
                </p>
                {bestDate(pb.bestWeight.at) && (
                  <p className="text-xs font-medium text-secondary mt-0.5">{bestDate(pb.bestWeight.at)}</p>
                )}
              </div>
            )}
            {pb.bestReps && (
              <div className="bg-ink/10 rounded-2xl px-3.5 py-3">
                <p className="text-[0.6875rem] font-bold text-secondary flex items-center gap-1.5">
                  <Medal className="w-3.5 h-3.5 text-accent" /> Best reps
                </p>
                <p className="text-xl font-bold tabular-nums tracking-[-0.02em] leading-snug mt-0.5 text-accent">
                  {pb.bestReps.reps} reps
                </p>
                {bestDate(pb.bestReps.at) && (
                  <p className="text-xs font-medium text-secondary mt-0.5">{bestDate(pb.bestReps.at)}</p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Progression chart + full history */}
        <ExerciseHistory exercise={exercise} completedSets={completedSets} />
      </main>
    </div>
  );
}
