import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { websocketService } from '../services/websocket';
import { SessionState, SESSION_EVENT } from '@rohit-constellation/types';
import { useSession } from '../context/SessionContext';

export const JoinSession: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [hasQuestion, setHasQuestion] = useState(false);
  const { setParticipantId, participantId } = useSession();

  // On mount, set participantId from localStorage if not set
  useEffect(() => {
    if (!participantId) {
      try {
        const stored = localStorage.getItem('session_participant');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.id) {
            console.log('[JoinSession] Setting participantId from localStorage:', parsed.id);
            setParticipantId(parsed.id);
          }
        }
      } catch (e) {
        console.error('[JoinSession] Error reading participantId from localStorage', e);
      }
    }
  }, [participantId, setParticipantId]);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      return;
    }
    websocketService.connect(sessionId);

    // Handle session state updates
    websocketService.onSessionStateUpdate((state) => {
      setSessionState(state);
      if (state.status === 'ACTIVE') {
        setIsSessionActive(true);
      }
      console.log('[JoinSession] Session state update:', state.status);

      // Fix: If submitted, participantId is not set, and session state is received, try to find participant by name/role
      if (submitted && !participantId && name && role && state.participants) {
        const found = state.participants.find(
          (p) => p.name === name && p.role === role
        );
        if (found) {
          console.log('[JoinSession] Found participant in session state:', found);
          setParticipantId(found.id);
        }
      }
    });

    // Register handler ONCE for participant joined
    websocketService.on(SESSION_EVENT.PARTICIPANT_JOINED, (response: any) => {
      console.log('[JoinSession] Participant joined:', response);
      if (response && response.participantId) {
        setParticipantId(response.participantId);
      }
    });

    // Handle question ready event
    websocketService.onQuestionReady(() => {
      setHasQuestion(true);
      console.log('[JoinSession] Question ready event received');
    });

    return () => {
      websocketService.removeAllListeners();
      websocketService.disconnect();
    };
  }, [sessionId, setParticipantId]);

  // Navigate to /active when session is active and participantId is set
  useEffect(() => {
    console.log('[JoinSession] Navigation check:', {
      isSessionActive,
      participantId,
      hasQuestion
    });

    if (!participantId) {
      setParticipantId(JSON.parse(localStorage.getItem("session_participant") || "{}").id);
    }
    console.log('Participant ID>>>>>:', participantId);

    if (isSessionActive && participantId) {
      navigate(`/session/${sessionId}/active`);
    }
  }, [isSessionActive, hasQuestion, navigate, sessionId, participantId]);

  const handleSubmit = () => {
    if (!name || !role || !sessionId) return;
    try {
      websocketService.joinSession(name, role, setParticipantId);
      setSubmitted(true);
    } catch (err) {
      setError('Failed to join session. Please try again.');
      console.error('Error joining session:', err);
    }
  };

  const handleLeave = () => {
    if (participantId) {
      websocketService.leaveSession(participantId);
    }
    setSubmitted(false);
    setName('');
    setRole('');
  };

  if (error) {
    return (
      <div className="max-w-md mx-auto py-16">
        <div className="bg-white rounded-lg shadow p-8">
          <div className="text-red-600 text-center">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-16">
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-6 text-center">Join Session</h2>
        {!submitted ? (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                className="w-full border rounded px-3 py-2"
                placeholder="Enter your name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-1">Role</label>
              <input
                className="w-full border rounded px-3 py-2"
                placeholder="Enter your role (e.g. Developer, Designer)"
                value={role}
                onChange={e => setRole(e.target.value)}
              />
            </div>
            <button
              className="w-full px-6 py-2 rounded bg-blue-600 text-white font-semibold disabled:bg-gray-400"
              disabled={!name || !role}
              onClick={handleSubmit}
            >
              Join Session
            </button>
          </>
        ) : (
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-700 mb-4">
              {isSessionActive && !hasQuestion ? 'Session started, waiting for question...' : 'Waiting for session to start...'}
            </div>
            <button
              className="mt-4 px-4 py-2 rounded bg-red-600 text-white font-semibold"
              onClick={handleLeave}
            >
              Leave Session
            </button>
            {sessionState && (
              <div className="text-sm text-gray-500 mt-4">
                <div>Session: {sessionState.id}</div>
                <div>Status: {sessionState.status}</div>
                <div>Participants: {sessionState.participants.length}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}; 