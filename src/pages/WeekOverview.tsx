import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, CheckCircle2, Trophy, Calendar, Dumbbell, Activity } from 'lucide-react';
import { TRAINING_PLAN, WeekPlan, WorkoutDay } from '../data';
import { cn } from '../lib/utils';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Link } from 'react-router-dom';

type SetLog = {
  completed: boolean;
  weight?: string;
  actualReps?: string;
};

export default function WeekOverview() {
  const [selectedWeek, setSelectedWeek] = useLocalStorage<number>('volleyball-selected-week', 1);
  const [completedSets] = useLocalStorage<Record<string, SetLog>>('volleyball-workout-progress-v2', {});

  const currentWeekPlan = TRAINING_PLAN.find((w) => w.weekNumber === selectedWeek) || TRAINING_PLAN[0];

  const getDayProgress = (day: WorkoutDay) => {
    let totalSets = 0;
    let completed = 0;
    day.exercises.forEach((ex) => {
      totalSets += ex.sets;
      for (let i = 0; i < ex.sets; i++) {
        if (completedSets[`${ex.id}-${i}`]?.completed) completed++;
      }
    });
    return { total: totalSets, completed, percentage: totalSets === 0 ? 0 : Math.round((completed / totalSets) * 100) };
  };

  const getWeekProgress = (week: WeekPlan) => {
    let totalSets = 0;
    let completed = 0;
    week.days.forEach(day => {
      day.exercises.forEach(ex => {
         totalSets += ex.sets;
         for (let i = 0; i < ex.sets; i++) {
          if (completedSets[`${ex.id}-${i}`]?.completed) completed++;
        }
      });
    });
    return { total: totalSets, completed, percentage: totalSets === 0 ? 0 : Math.round((completed / totalSets) * 100) };
  };

  const weekProgress = getWeekProgress(currentWeekPlan);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-neutral-200">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neutral-900 text-white rounded-xl flex items-center justify-center shadow-sm">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-semibold text-lg leading-tight">Volleyball Strength</h1>
              <p className="text-xs text-neutral-500 font-medium">12-Week Programme</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-24">
        
        {/* Week Selector & Overview */}
        <div className="mb-8">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider mb-1">Block {currentWeekPlan.block.charAt(0)}</h2>
              <h3 className="text-3xl font-bold tracking-tight">Week {currentWeekPlan.weekNumber}</h3>
            </div>
            
            <div className="text-right">
              <span className="text-2xl font-bold">{weekProgress.percentage}%</span>
              <p className="text-xs text-neutral-500 font-medium">completed</p>
            </div>
          </div>
          
          <div className="w-full bg-neutral-200 rounded-full h-2.5 mb-6 overflow-hidden">
            <motion.div 
              className="bg-neutral-900 h-2.5 rounded-full" 
              initial={{ width: 0 }}
              animate={{ width: `${weekProgress.percentage}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>

          <div className="flex overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 gap-2 scrollbar-hide">
            {TRAINING_PLAN.map((week) => {
              const p = getWeekProgress(week);
              const isSelected = week.weekNumber === selectedWeek;
              return (
                <button
                  key={week.id}
                  onClick={() => setSelectedWeek(week.weekNumber)}
                  className={cn(
                    "flex-shrink-0 flex flex-col items-center justify-center w-14 h-16 rounded-2xl border transition-all duration-200",
                    isSelected 
                      ? "border-neutral-900 bg-neutral-900 text-white shadow-md" 
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
                  )}
                >
                  <span className="text-xs font-medium">Wk {week.weekNumber}</span>
                  {p.percentage === 100 && (
                    <Trophy className={cn("w-3.5 h-3.5 mt-1", isSelected ? "text-neutral-300" : "text-neutral-900")} />
                  )}
                  {p.percentage > 0 && p.percentage < 100 && (
                    <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5", isSelected ? "bg-neutral-400" : "bg-neutral-900")} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="bg-white p-5 rounded-2xl border border-neutral-200 mt-2 shadow-sm">
            <h4 className="font-semibold text-neutral-900 mb-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-neutral-500" />
              Focus: {currentWeekPlan.block.substring(4)}
            </h4>
            <p className="text-sm text-neutral-600 leading-relaxed">
              {currentWeekPlan.focus}
            </p>
          </div>
        </div>

        {/* Days List */}
        <div className="space-y-4">
          {currentWeekPlan.days.map((day) => {
             const progress = getDayProgress(day);
             return (
               <DayCard 
                 key={day.id} 
                 day={day} 
                 progress={progress}
                 weekNumber={currentWeekPlan.weekNumber}
               />
             )
          })}
        </div>

      </main>
    </div>
  );
}

const DayCard: React.FC<{ 
  day: WorkoutDay, 
  progress: { total: number, completed: number, percentage: number },
  weekNumber: number
}> = ({ day, progress, weekNumber }) => {
  const isFullyCompleted = progress.total > 0 && progress.percentage === 100;

  return (
    <Link 
      to={`/workout/${day.id}`}
      className={cn(
        "block bg-white rounded-2xl border overflow-hidden transition-all duration-300 active:scale-[0.98]",
        isFullyCompleted ? "border-neutral-300 bg-neutral-50" : "border-neutral-200 shadow-sm hover:border-neutral-300 hover:shadow-md"
      )}
    >
      <div className="w-full p-5 flex items-center justify-between text-left">
        <div className="flex-1 pr-4">
          <div className="flex items-center gap-3 mb-1">
             <span className={cn(
               "px-2.5 py-0.5 rounded-md text-xs font-bold tracking-wider",
               isFullyCompleted ? "bg-neutral-200 text-neutral-600" : "bg-neutral-900 text-white"
             )}>
               DAY {day.day}
             </span>
             {isFullyCompleted && <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> Complete</span>}
          </div>
          <h3 className={cn("text-lg font-semibold", isFullyCompleted && "text-neutral-600")}>
            {day.title.split(': ')[1] || day.title}
          </h3>
          
          <div className="flex items-center gap-4 mt-3">
             <div className="flex items-center gap-1.5 text-sm text-neutral-500">
               <Dumbbell className="w-4 h-4" />
               <span>{day.exercises.length} exercises</span>
             </div>
             <div className="flex items-center gap-2 flex-1 max-w-[120px]">
                <div className="flex-1 bg-neutral-200 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={cn("h-full rounded-full transition-all duration-500", isFullyCompleted ? "bg-neutral-400" : "bg-neutral-900")} 
                    style={{ width: `${progress.percentage}%` }} 
                  />
                </div>
                <span className="text-xs font-medium text-neutral-500 w-8 text-right">{progress.completed}/{progress.total}</span>
             </div>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-neutral-50 text-neutral-400">
          <ChevronRight className="w-5 h-5" />
        </div>
      </div>
    </Link>
  );
}
