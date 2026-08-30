export type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: string; // e.g., "3x8" or "8-10" or "4x5"
  notes?: string;
};

export type WorkoutDay = {
  id: string;
  day: number;
  title: string;
  exercises: Exercise[];
};

export type WeekPlan = {
  id: string;
  weekNumber: number;
  block: string;
  focus: string;
  days: WorkoutDay[];
};

const createId = () => Math.random().toString(36).substring(2, 9);

export const TRAINING_PLAN: WeekPlan[] = Array.from({ length: 12 }).map((_, weekIndex) => {
  const weekNumber = weekIndex + 1;
  let block = "";
  let focus = "";
  
  if (weekNumber <= 4) {
    block = "1 — Rebuild";
    focus = "Re-accumulate volume, restore tissue tolerance, re-groove clean technique";
  } else if (weekNumber <= 8) {
    block = "2 — Load";
    focus = "Push absolute strength numbers, introduce max velocity sprinting";
  } else {
    block = "3 — Power & Peaking";
    focus = "Convert strength to power, max intent jumps, taper for competition";
  }

  // Generate slightly different workouts based on the block
  const getExercises = (dayTitle: string, dayNumber: number): Exercise[] => {
    if (block === "1 — Rebuild") {
      if (dayTitle.includes("Lower")) {
        return [
          { id: `w${weekNumber}-d${dayNumber}-e1`, name: "Back Squat", sets: 3, reps: "8-10", notes: "Controlled eccentric" },
          { id: `w${weekNumber}-d${dayNumber}-e2`, name: "Romanian Deadlift", sets: 3, reps: "8-10", notes: "Focus on hamstring stretch" },
          { id: `w${weekNumber}-d${dayNumber}-e3`, name: "Reverse Lunge", sets: 3, reps: "10/leg", notes: "Dumbbells" },
          { id: `w${weekNumber}-d${dayNumber}-e4`, name: "Calf Raises", sets: 3, reps: "15", notes: "Full range of motion" },
        ];
      } else {
        return [
          { id: `w${weekNumber}-d${dayNumber}-e1`, name: "Bench Press", sets: 3, reps: "8-10", notes: "Leave 2 reps in reserve" },
          { id: `w${weekNumber}-d${dayNumber}-e2`, name: "Pull-ups", sets: 3, reps: "Max-2", notes: "Use band if needed" },
          { id: `w${weekNumber}-d${dayNumber}-e3`, name: "Dumbbell Row", sets: 3, reps: "10/arm", notes: "Heavy" },
          { id: `w${weekNumber}-d${dayNumber}-e4`, name: "Plank Variations", sets: 3, reps: "45s", notes: "Anti-extension focus" },
        ];
      }
    } else if (block === "2 — Load") {
      if (dayTitle.includes("Lower")) {
        return [
          { id: `w${weekNumber}-d${dayNumber}-e1`, name: "Power Clean", sets: 4, reps: "3", notes: "Focus on speed and catch" },
          { id: `w${weekNumber}-d${dayNumber}-e2`, name: "Trap Bar Deadlift", sets: 4, reps: "5", notes: "Heavy, push the ground away" },
          { id: `w${weekNumber}-d${dayNumber}-e3`, name: "Bulgarian Split Squat", sets: 3, reps: "6-8/leg", notes: "Dumbbells" },
          { id: `w${weekNumber}-d${dayNumber}-e4`, name: "Box Jumps", sets: 3, reps: "5", notes: "Reset between jumps" },
        ];
      } else {
        return [
          { id: `w${weekNumber}-d${dayNumber}-e1`, name: "Push Press", sets: 4, reps: "5", notes: "Explosive lockout" },
          { id: `w${weekNumber}-d${dayNumber}-e2`, name: "Weighted Pull-ups", sets: 4, reps: "5", notes: "" },
          { id: `w${weekNumber}-d${dayNumber}-e3`, name: "Med Ball Throws", sets: 3, reps: "8", notes: "Overhead or rotational" },
          { id: `w${weekNumber}-d${dayNumber}-e4`, name: "Pallof Press", sets: 3, reps: "10/side", notes: "Anti-rotation" },
        ];
      }
    } else {
       if (dayTitle.includes("Lower")) {
        return [
          { id: `w${weekNumber}-d${dayNumber}-e1`, name: "Hang Clean", sets: 3, reps: "2-3", notes: "Max intent" },
          { id: `w${weekNumber}-d${dayNumber}-e2`, name: "Front Squat", sets: 3, reps: "3-4", notes: "Maintain velocity" },
          { id: `w${weekNumber}-d${dayNumber}-e3`, name: "Depth Jumps", sets: 4, reps: "4", notes: "Minimize ground contact time" },
          { id: `w${weekNumber}-d${dayNumber}-e4`, name: "Broad Jumps", sets: 3, reps: "3", notes: "Max distance" },
        ];
      } else {
        return [
          { id: `w${weekNumber}-d${dayNumber}-e1`, name: "Speed Bench Press", sets: 4, reps: "3", notes: "Bands if possible, move fast" },
          { id: `w${weekNumber}-d${dayNumber}-e2`, name: "Plyo Push-ups", sets: 3, reps: "5", notes: "Clap or land on plates" },
          { id: `w${weekNumber}-d${dayNumber}-e3`, name: "Explosive Row", sets: 3, reps: "5", notes: "Heavy, fast pull" },
          { id: `w${weekNumber}-d${dayNumber}-e4`, name: "Sprints", sets: 5, reps: "15m", notes: "Full recovery between reps" },
        ];
      }
    }
  };

  return {
    id: `w${weekNumber}`,
    weekNumber,
    block,
    focus,
    days: [
      { id: `w${weekNumber}-d1`, day: 1, title: "Day 1: Lower Body & Mechanics", exercises: getExercises("Lower", 1) },
      { id: `w${weekNumber}-d2`, day: 2, title: "Day 2: Upper Body & Trunk", exercises: getExercises("Upper", 2) },
      { id: `w${weekNumber}-d3`, day: 3, title: "Day 3: Lower Body Power", exercises: getExercises("Lower", 3) },
      { id: `w${weekNumber}-d4`, day: 4, title: "Day 4: Upper Body Speed/Plyos", exercises: getExercises("Upper", 4) },
    ]
  };
});
