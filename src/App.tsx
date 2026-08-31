import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WeeksPage from './pages/WeeksPage';
import WeekOverview from './pages/WeekOverview';
import WorkoutPage from './pages/WorkoutPage';
import CompletionPage from './pages/CompletionPage';
import { ActiveWorkoutPill } from './components/ActiveWorkoutPill';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WeeksPage />} />
        <Route path="/week/:weekNumber" element={<WeekOverview />} />
        <Route path="/workout/:id" element={<WorkoutPage />} />
        <Route path="/complete/:id" element={<CompletionPage />} />
      </Routes>
      <ActiveWorkoutPill />
    </BrowserRouter>
  );
}
