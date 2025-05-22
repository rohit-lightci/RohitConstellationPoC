import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { SessionStepper } from './components/SessionStepper'
import { JoinSession } from './components/JoinSession'
import { ActiveSession } from './components/ActiveSession'

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100 p-8">
        <Routes>
          <Route path="/" element={<SessionStepper />} />
          <Route path="/join/:sessionId" element={<JoinSession />} />
          <Route path="/session/:sessionId/active" element={<ActiveSession />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
} 