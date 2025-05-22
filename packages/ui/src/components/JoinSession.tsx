import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { websocketService, SessionState, SessionParticipant } from '../services/websocket';

export const JoinSession: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      return;
    }

    // Connect to WebSocket when component mounts
    websocketService.connect(sessionId);

    // Set up event listeners
    websocketService.onSessionStateUpdate((state) => {
      setSessionState(state);
      if (state.status === 'active') {
        // Navigate to active session view when session starts
        navigate(`/session/${sessionId}/active`);
      }
    });

    websocketService.onParticipantJoined((participant) => {
      console.log('New participant joined:', participant);
    });

    // Cleanup on unmount
    return () => {
      websocketService.removeAllListeners();
      websocketService.disconnect();
    };
  }, [sessionId, navigate]);

  const handleSubmit = () => {
    if (!name || !role || !sessionId) return;

    try {
      websocketService.joinSession(name, role);
      setSubmitted(true);
    } catch (err) {
      setError('Failed to join session. Please try again.');
      console.error('Error joining session:', err);
    }
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
              Waiting for session to start...
            </div>
            {sessionState && (
              <div className="text-sm text-gray-500">
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