import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import HomePage from './pages/HomePage';
import WeeksPage from './pages/WeeksPage';
import WeekOverview from './pages/WeekOverview';
import WorkoutPage from './pages/WorkoutPage';
import CompletionPage from './pages/CompletionPage';
import ProfilePage from './pages/ProfilePage';
import { ActiveWorkoutPill } from './components/ActiveWorkoutPill';
import { TabBar } from './components/TabBar';

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <p className="text-mist">Page not found.</p>
      <Link to="/" className="text-white font-bold underline">
        Back to home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/programme" element={<WeeksPage />} />
        <Route path="/week/:weekNumber" element={<WeekOverview />} />
        <Route path="/workout/:id" element={<WorkoutPage />} />
        <Route path="/complete/:id" element={<CompletionPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ActiveWorkoutPill />
      <TabBar />
    </BrowserRouter>
  );
}
