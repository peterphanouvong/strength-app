import { WeekPlan } from '../../data';

export type ProgrammeSource = 'seed' | 'ai' | 'custom';

export type Programme = {
  id: string;
  name: string;
  source: ProgrammeSource;
  createdAt: number;
  revision: number; // bumped on every applied op batch
  weeks: WeekPlan[];
};

export type Profile = {
  goals: string;
  sportContext?: string;
  equipment: string[];
  daysPerWeek: number;
  experience: 'beginner' | 'intermediate' | 'advanced';
};
