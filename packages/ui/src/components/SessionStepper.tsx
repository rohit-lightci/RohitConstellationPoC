import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SessionSetup } from './SessionSetup';
import { ParticipationStep } from './ParticipationStep';
import { PreviewStep } from './PreviewStep';
import { LaunchStep } from './LaunchStep';
import { JoinSession } from './JoinSession';
import { websocketService } from '../services/websocket';
import { SessionState } from '@rohit-constellation/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/v1';


export interface SessionData {
  template?: string;
  title: string;
  description?: string;
  duration: number;
  anonymous?: boolean;
  participationRule?: string;
  permissions?: {
    askQuestions: boolean;
    reactUpvote: boolean;
    seeResponses: boolean;
  };
  // Add more fields as needed
}

export const SessionStepper: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [sessionData, setSessionData] = useState<SessionData>({
    title: '',
    duration: 0,
    anonymous: true,
    permissions: {
      askQuestions: true,
      reactUpvote: true,
      seeResponses: true,
    },
  });
  const [participantStep, setParticipantStep] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      websocketService.connect(sessionId);
      websocketService.joinSession('Admin', 'HOST');

      websocketService.onSessionStateUpdate((state) => {
        console.log('Session state updated received:', state);
        setSessionState(state);
        if (state.status === 'active') {
          // Navigate to active session view when session starts
          navigate(`/session/${sessionId}/active`);
        }
      });

      websocketService.onParticipantJoined((participant) => {
        console.log('New participant joined:', participant);
      });

      return () => {
        websocketService.removeAllListeners();
        websocketService.disconnect();
      };
    }
  }, [sessionId, navigate]);

  // Handlers to update session data from each step
  const handleSessionSetupContinue = async (data: { template: string; title: string; duration: number }) => {
    try {
      setSessionData((prev) => ({ ...prev, template: data.template, title: data.title, duration: data.duration }));
      setStep(1);
    } catch (err) {
      setError('Failed to update session data. Please try again.');
      console.error('Error updating session data:', err);
    }
  };

  const handleParticipationContinue = async () => {
    try {
      // Create session using the API with all collected data
      console.log('Creating session with data:', sessionData);
      console.log('API_URL:', API_URL);
      const response = await fetch(`${API_URL}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: sessionData.title,
          template: sessionData.template,
          type: 'RETRO',
          globalTimeLimit: sessionData.duration,
          description: sessionData.description,
          isAnonymous: sessionData.anonymous,
          participationRule: sessionData.participationRule,
          permissions: sessionData.permissions,
          createdBy: 'current-user-id', // TODO: Get from auth context
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      const { id: newSessionId } = await response.json();
      setSessionId(newSessionId);
      
      setStep(2);
    } catch (err) {
      setError('Failed to create session. Please try again.');
      console.error('Error creating session:', err);
    }
  };

  const handleLaunchContinue = () => {
    setStep(4);
  };

  const handleStartSession = async () => {
    if (!sessionId) return;

    try {
      websocketService.startSession();
      // Navigation will be handled by the session state update listener
    } catch (err) {
      setError('Failed to start session. Please try again.');
      console.error('Error starting session:', err);
    }
  };

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="bg-white rounded-lg shadow p-8">
          <div className="text-red-600 text-center">{error}</div>
          <button
            className="mt-4 px-4 py-2 rounded bg-blue-600 text-white font-semibold"
            onClick={() => setError(null)}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Demo: Button to go to join page */}
      {!participantStep && (
        <div className="flex justify-end mb-4">
          <button
            className="px-4 py-2 rounded bg-green-600 text-white font-semibold"
            onClick={() => setParticipantStep(true)}
          >
            Join as Participant
          </button>
        </div>
      )}
      {/* Participant join page */}
      {participantStep && sessionId && (
        <JoinSession />
      )}
      {/* Main session flow */}
      {!participantStep && (
        <>
          {step === 0 && (
            <SessionSetup
              onContinue={handleSessionSetupContinue}
              data={sessionData}
              setData={setSessionData}
            />
          )}
          {step === 1 && (
            <ParticipationStep
              onBack={() => setStep(0)}
              onContinue={handleParticipationContinue}
              data={sessionData}
              setData={setSessionData}
            />
          )}
          {step === 2 && (
            <PreviewStep
              onBack={() => setStep(1)}
              onContinue={() => setStep(3)}
              data={sessionData}
            />
          )}
          {step === 3 && (
            <LaunchStep onBack={() => setStep(2)} onContinue={handleLaunchContinue} sessionData={sessionData} />
          )}
          {step === 4 && sessionId && (
            <div className="max-w-4xl mx-auto py-10">
              <h1 className="text-3xl font-bold mb-6">Waiting for participants</h1>
              <div className="bg-white rounded-lg shadow p-8 flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  <div className="mb-4 font-semibold text-lg">Share this link or QR code with participants to join the session</div>
                  <div className="mb-4">
                    <input
                      className="w-full border rounded px-3 py-2 font-mono text-sm bg-gray-100"
                      value={`${window.location.origin}/join/${sessionId}`}
                      readOnly
                    />
                  </div>
                  <button 
                    className="px-6 py-2 rounded bg-blue-600 text-white font-semibold"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/join/${sessionId}`);
                    }}
                  >
                    Copy Join Link
                  </button>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <div className="w-32 h-32 bg-gray-100 flex items-center justify-center rounded-lg border mb-2">QR</div>
                  <div className="text-xs text-gray-500">Scan to join</div>
                </div>
              </div>
              <div className="mt-8 flex flex-col md:flex-row gap-8">
                <div className="flex-1 bg-white rounded-lg shadow p-6">
                  <div className="font-semibold mb-2">Session Info</div>
                  <div className="text-sm text-gray-500 mb-1">Type: <span className="font-semibold text-gray-700">{sessionData.template || 'Retrospective'}</span></div>
                  <div className="text-sm text-gray-500 mb-1">Duration: <span className="font-semibold text-gray-700">{sessionData.duration || 60} min</span></div>
                  <div className="text-sm text-gray-500 mb-1">Anonymous: <span className="font-semibold text-gray-700">{sessionData.anonymous ? 'Yes' : 'No'}</span></div>
                </div>
                <div className="flex-1 bg-white rounded-lg shadow p-6">
                  <div className="font-semibold mb-2">Participants</div>
                  {sessionState ? (
                    <ul className="text-sm text-gray-700">
                      {sessionState.participants.map((participant) => (
                        <li key={participant.id} className="flex items-center gap-2">
                          {participant.name}
                          <span className={`ml-2 text-xs rounded px-2 py-0.5 ${participant.status === 'ACTIVE' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                            {participant.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          </span>
                          {participant.isHost && (
                            <span className="ml-2 text-xs bg-gray-200 rounded px-2 py-0.5">Host</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-500">No participants yet</div>
                  )}
                </div>
              </div>
              <div className="mt-12 bg-white rounded-lg shadow p-6 flex items-center justify-between">
                <div>
                  <div className="font-bold text-lg mb-1">Ready to Start?</div>
                  <div className="text-gray-500 text-sm">
                    {sessionState?.participants.length ? 
                      `${sessionState.participants.filter(p => p.status === 'ACTIVE')?.length} participants have joined.` :
                      'Waiting for participants to join...'}
                  </div>
                </div>
                <button 
                  className="px-6 py-2 rounded bg-blue-600 text-white font-semibold flex items-center disabled:bg-gray-400"
                  disabled={!sessionState?.participants.length}
                  onClick={handleStartSession}
                >
                  <span className="mr-2">▶</span> Start Session
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}; 