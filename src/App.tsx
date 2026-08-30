import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WeekOverview from './pages/WeekOverview';
import WorkoutPage from './pages/WorkoutPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WeekOverview />} />
        <Route path="/workout/:id" element={<WorkoutPage />} />
      </Routes>
    </BrowserRouter>
  );
}
