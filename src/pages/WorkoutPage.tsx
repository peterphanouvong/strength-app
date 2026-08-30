import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, CheckCircle2, Circle, Activity } from 'lucide-react';
import { TRAINING_PLAN, WorkoutDay, Exercise } from '../data';
import { cn } from '../lib/utils';
import { useLocalStorage } from '../hooks/useLocalStorage';

type SetLog = {
  completed: boolean;
  weight?: string;
  actualReps?: string;
};

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [completedSets, setCompletedSets] = useLocalStorage<Record<string, SetLog>>('volleyball-workout-progress-v2', {});

  // Find the day across all weeks
  let day: WorkoutDay | undefined;
  let weekNum = 1;
  for (const week of TRAINING_PLAN) {
    const found = week.days.find(d => d.id === id);
    if (found) {
      day = found;
      weekNum = week.weekNumber;
      break;
    }
  }

  if (!day) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Workout not found.</p>
        <button onClick={() => navigate('/')} className="text-blue-500 underline ml-2">Go back</button>
      </div>
    );
  }

  const toggleSet = (exerciseId: string, setIndex: number) => {
    const key = `${exerciseId}-${setIndex}`;
    setCompletedSets((prev) => {
      const current = prev[key] || { completed: false, weight: '', actualReps: '' };
      return {
        ...prev,
        [key]: { ...current, completed: !current.completed },
      };
    });
  };

  const updateSetLog = (exerciseId: string, setIndex: number, field: 'weight' | 'actualReps', value: string) => {
    const key = `${exerciseId}-${setIndex}`;
    setCompletedSets((prev) => {
      const current = prev[key] || { completed: false, weight: '', actualReps: '' };
      return {
        ...prev,
        [key]: { ...current, [field]: value },
      };
    });
  };

  const getPreviousSetLog = (exerciseName: string, currentWeekNum: number, setIndex: number) => {
    if (currentWeekNum === 1) return null;
    
    for (let w = currentWeekNum - 1; w >= 1; w--) {
      const prevWeek = TRAINING_PLAN.find(plan => plan.weekNumber === w);
      if (!prevWeek) continue;
      
      for (const d of prevWeek.days) {
        const prevExercise = d.exercises.find(e => e.name === exerciseName);
        if (prevExercise) {
          const key = `${prevExercise.id}-${setIndex}`;
          const log = completedSets[key];
          if (log && log.completed && log.weight) {
            return log;
          }
        }
      }
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans pb-24">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <button 
            onClick={() => navigate('/')}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold text-lg leading-tight">{day.title.split(': ')[1] || day.title}</h1>
            <p className="text-xs text-neutral-500 font-medium">Week {weekNum} • Day {day.day}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="space-y-8">
          {day.exercises.map((exercise, index) => (
            <ExerciseCard 
              key={exercise.id} 
              exercise={exercise} 
              index={index} 
              weekNum={weekNum}
              completedSets={completedSets}
              toggleSet={toggleSet}
              updateSetLog={updateSetLog}
              getPreviousSetLog={getPreviousSetLog}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

const ExerciseCard: React.FC<{
  exercise: Exercise;
  index: number;
  weekNum: number;
  completedSets: Record<string, SetLog>;
  toggleSet: (exerciseId: string, setIndex: number) => void;
  updateSetLog: (exerciseId: string, setIndex: number, field: 'weight' | 'actualReps', value: string) => void;
  getPreviousSetLog: (exerciseName: string, currentWeekNum: number, setIndex: number) => SetLog | null;
}> = ({ exercise, index, weekNum, completedSets, toggleSet, updateSetLog, getPreviousSetLog }) => {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-neutral-100 bg-neutral-50/50">
        <div className="flex justify-between items-start mb-2">
          <h2 className="font-bold text-lg text-neutral-900">{index + 1}. {exercise.name}</h2>
          <span className="bg-neutral-900 text-white text-xs font-bold px-2.5 py-1 rounded-md tracking-wider">
            {exercise.sets} × {exercise.reps}
          </span>
        </div>
        {exercise.notes && (
          <p className="text-sm text-neutral-600">{exercise.notes}</p>
        )}
      </div>

      <div className="p-3 sm:p-5">
        <div className="grid grid-cols-12 gap-2 mb-3 px-1 sm:px-2 text-[10px] sm:text-xs font-semibold text-neutral-400 uppercase tracking-wider text-center">
          <div className="col-span-1">Set</div>
          <div className="col-span-3 text-left">Previous</div>
          <div className="col-span-3">kg</div>
          <div className="col-span-3">Reps</div>
          <div className="col-span-2 text-center">
            <CheckCircle2 className="w-4 h-4 mx-auto" />
          </div>
        </div>

        <div className="space-y-2 sm:space-y-3">
          {Array.from({ length: exercise.sets }).map((_, setIndex) => {
            const key = `${exercise.id}-${setIndex}`;
            const log = completedSets[key] || { completed: false, weight: '', actualReps: '' };
            const prevLog = getPreviousSetLog(exercise.name, weekNum, setIndex);
            
            return (
              <div 
                key={setIndex} 
                className={cn(
                  "grid grid-cols-12 gap-2 items-center p-1 sm:p-2 rounded-xl transition-colors",
                  log.completed ? "bg-neutral-50" : "bg-white"
                )}
              >
                <div className="col-span-1 text-center font-bold text-neutral-400 text-sm">
                  {setIndex + 1}
                </div>
                
                <div className="col-span-3 text-left">
                  <span className="text-[10px] sm:text-xs font-medium text-neutral-500 whitespace-nowrap overflow-hidden text-ellipsis block w-full">
                    {prevLog ? `${prevLog.weight}kg × ${prevLog.actualReps || '-'}` : '—'}
                  </span>
                </div>
                
                <div className="col-span-3">
                  <input
                    type="number"
                    placeholder="—"
                    value={log.weight || ''}
                    onChange={(e) => updateSetLog(exercise.id, setIndex, 'weight', e.target.value)}
                    disabled={log.completed}
                    className="w-full bg-neutral-100 text-center rounded-lg py-2 sm:py-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:opacity-50"
                  />
                </div>
                
                <div className="col-span-3">
                  <input
                    type="number"
                    placeholder={exercise.reps.replace(/[^0-9-]/g, '') || '—'}
                    value={log.actualReps || ''}
                    onChange={(e) => updateSetLog(exercise.id, setIndex, 'actualReps', e.target.value)}
                    disabled={log.completed}
                    className="w-full bg-neutral-100 text-center rounded-lg py-2 sm:py-2.5 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-neutral-900 disabled:opacity-50"
                  />
                </div>
                
                <div className="col-span-2 flex justify-center">
                  <button
                    onClick={() => toggleSet(exercise.id, setIndex)}
                    className={cn(
                      "w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95",
                      log.completed 
                        ? "bg-[#5E9B73] text-white shadow-sm" 
                        : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"
                    )}
                  >
                    {log.completed ? <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" /> : <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 border-neutral-300" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
