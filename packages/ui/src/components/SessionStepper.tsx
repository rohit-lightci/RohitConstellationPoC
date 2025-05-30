import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SessionSetup } from './SessionSetup';
import { ParticipationStep } from './ParticipationStep';
import { PreviewStep } from './PreviewStep';
import { LaunchStep } from './LaunchStep';
import { websocketService } from '../services/websocket';
import { SessionState } from '@rohit-constellation/types';
import { WaitingLobby } from './WaitingLobby';


console.log('SessionStepper');

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/v1';


export interface SessionData {
  template?: string;
  title: string;
  description?: string;
  duration: number;
  customPrompt?: string;
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
    customPrompt: '',
    anonymous: true,
    permissions: {
      askQuestions: true,
      reactUpvote: true,
      seeResponses: true,
    },
  });
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      websocketService.connect(sessionId);
      websocketService.joinSession('Admin', 'HOST', (adminParticipantId) => {
        console.log('Admin joined with participant ID:', adminParticipantId);
        // If SessionStepper needs to store/use adminParticipantId, it can be done here.
        // For now, just logging, as participantId is mainly handled by SessionContext.
      });

      websocketService.onSessionStateUpdate((state) => {
        console.log('Session state updated received:', state);
        setSessionState(state);
      });

      websocketService.onParticipantJoined((participant) => {
        console.log('New participant joined:', participant);
      });

      return () => {
        websocketService.removeAllListeners();
        websocketService.disconnect();
      };
    }
  }, [sessionId]);

  // Handlers to update session data from each step
  const handleSessionSetupContinue = async (data: { template: string; title: string; duration: number; customPrompt?: string }) => {
    try {
      setSessionData((prev) => ({ ...prev, template: data.template, title: data.title, duration: data.duration, customPrompt: data.customPrompt }));
      setStep(1);
    } catch (err) {
      setError('Failed to update session data. Please try again.');
      console.error('Error updating session data:', err);
    }
  };


  const createSession = async () => {
    try {
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
          customPrompt: sessionData.customPrompt,
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
      return newSessionId;
    } catch (err) {
      setError('Failed to create session. Please try again.');
      console.error('Error creating session:', err);
    }
  }

  const handleParticipationContinue = async () => {
    try {
      const newSessionId = await createSession();
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
    } catch (err) {
      setError('Failed to start session. Please try again.');
      console.error('Error starting session:', err);
    }
  };

  const handleEndSession = async () => {
    if (!sessionId) return;

    try {
      websocketService.endSession();
      navigate('/');
    } catch (err) {
      setError('Failed to end session. Please try again.');
      console.error('Error ending session:', err);
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
            <WaitingLobby
              sessionId={sessionId}
              sessionState={sessionState}
              sessionData={sessionData}
              handleCopyLink={() => navigator.clipboard.writeText(`${window.location.origin}/join/${sessionId}`)}
              handleStartSession={handleStartSession}
              handleEndSession={handleEndSession}
            />
          )}
    </>
  );
}; 