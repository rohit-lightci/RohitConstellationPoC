import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SessionStepper } from './components/SessionStepper'
import { JoinSession } from './components/JoinSession'
import { ActiveSession } from './components/ActiveSession'
import { SessionProvider } from './context/SessionContext'
import SessionResultsPage from './components/SessionResultsPage'

export const App: React.FC = () => {
  return (
    <SessionProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-100 p-8">
          <Routes>
            {/* <Route path="/" element={<SessionStepper />} /> */}
            <Route path="/" element={<SessionStepper />} />
            <Route path="/join/:sessionId" element={<JoinSession />} />
            <Route path="/session/:sessionId/active" element={<ActiveSession />} />
            <Route path="/session/:sessionId/results" element={<SessionResultsPage />} />
            <Route path="/session/:sessionId" element={<Navigate replace to="active" />} />
          </Routes>
        </div>
      </BrowserRouter>
    </SessionProvider>
  )
} 