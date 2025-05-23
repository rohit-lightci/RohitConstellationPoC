import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { websocketService } from '../services/websocket';
import { Question, SESSION_EVENT, SessionState } from '@rohit-constellation/types';
import { useSession } from '../context/SessionContext';

interface Answer {
  id: string;
  participantId: string;
  participantName: string;
  content: string;
  timestamp: number;
  upvotes: number;
}

export const ActiveSession: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const { participantId, setParticipantId } = useSession();

  // Set participantId from localStorage if not set
  useEffect(() => {
    if (!participantId) {
      setParticipantId(JSON.parse(localStorage.getItem("session_participant") || "{}").id);
    }
  }, [participantId]);



  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      return;
    }

    // Connect to WebSocket only once
    websocketService.connect(sessionId);

    // Set up event listeners
    websocketService.onSessionStateUpdate((state) => {
      console.log('Session state update received:', state);
      setSessionState(state);
      if (state.status === 'COMPLETED') {
        // Navigate to results view when session ends
        navigate(`/session/${sessionId}/results`);
      }
    });

    // Listen for new answers
    websocketService.on('session:question:answer:new', (answer: Answer) => {
      setAnswers(prev => [...prev, answer]);
    });

    // Listen for answer updates (e.g., upvotes)
    websocketService.on('session:question:answer:update', (updatedAnswer: Answer) => {
      setAnswers(prev => prev.map(a => a.id === updatedAnswer.id ? updatedAnswer : a));
    });

    websocketService.onQuestionReady(({ question }) => {
      console.log('Question ready received:', question);
      setCurrentQuestion(question);
    });

    // Cleanup
    return () => {
      websocketService.removeAllListeners();
    };
  }, [sessionId, navigate]);

  // Separate effect for getting questions
  useEffect(() => {
    if (!sessionId || !participantId) {
      console.log('No sessionId or participantId', sessionId, participantId);
      return;
    }
    
    // Only emit get question event, don't connect again
    console.log('Emitting get question event for participant:', participantId);
    websocketService.emit(SESSION_EVENT.GET_QUESTION, { sessionId, participantId });
  }, [sessionId, participantId]);

  const handleSubmitAnswer = () => {
    console.log('Current answer:', currentAnswer);
    console.log('Current question from state:', currentQuestion);
    console.log('Participant ID:', participantId);
    if (!currentAnswer.trim() || !currentQuestion?.id || !participantId) {
      console.log('Submit Answer Check Failed:', { currentAnswer, currentQuestion, participantId });
      return;
    }
    
    console.log('Submitting answer for question:', currentQuestion.id, 'by participant:', participantId);
    try {
      websocketService.submitAnswer(currentQuestion.id, currentAnswer, participantId);
      setCurrentAnswer('');
    } catch (err) {
      setError('Failed to submit answer. Please try again.');
      console.error('Error submitting answer:', err);
    }
  };

  const handleUpvote = (answerId: string) => {
    try {
      websocketService.emit('session:question:answer:upvote', { answerId });
    } catch (err) {
      console.error('Error upvoting answer:', err);
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

  if (!sessionState) {
    console.log('No session state', sessionState);
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="bg-white rounded-lg shadow p-8">
          <div className="text-center text-gray-500">Loading session...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10">
      <div className="bg-white rounded-lg shadow p-8 mb-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">{currentQuestion?.text}</h1>
            <div className="text-sm text-gray-500">
              {sessionState.participants.length} participants • {answers.length} answers
            </div>
          </div>
          {isHost && (
            <button
              className="px-4 py-2 rounded bg-blue-600 text-white font-semibold"
              onClick={() => websocketService.nextQuestion()}
            >
              Next Question
            </button>
          )}
        </div>

        {/* Answer input */}
        <div className="mb-8">
          <textarea
            className="w-full border rounded-lg p-4 mb-2 min-h-[100px] resize-none"
            placeholder="Type your answer here..."
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              className="px-6 py-2 rounded bg-blue-600 text-white font-semibold disabled:bg-gray-400"
              disabled={!currentAnswer.trim()}
              onClick={handleSubmitAnswer}
            >
              Submit Answer
            </button>
          </div>
        </div>

        {/* Answers list */}
        <div className="space-y-4">
          {answers.map((answer) => (
            <div key={answer.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold">{answer.participantName}</div>
                  <div className="text-sm text-gray-500">
                    {new Date(answer.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <button
                  className="flex items-center gap-1 text-gray-500 hover:text-blue-600"
                  onClick={() => handleUpvote(answer.id)}
                >
                  <span>↑</span>
                  <span>{answer.upvotes}</span>
                </button>
              </div>
              <div className="text-gray-700">{answer.content}</div>
            </div>
          ))}
          {answers.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              No answers yet. Be the first to share your thoughts!
            </div>
          )}
        </div>
      </div>

      {/* Participants sidebar */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="font-semibold mb-4">Participants</h2>
        <ul className="space-y-2">
          {sessionState.participants.map((participant) => (
            <li key={participant.id} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              {participant.name}
              {participant.isHost && (
                <span className="ml-2 text-xs bg-gray-200 rounded px-2 py-0.5">Host</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}; 