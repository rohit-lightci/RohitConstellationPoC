import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { websocketService } from '../services/websocket';
import { Question, SESSION_EVENT, SessionState, ParticipantStatus } from '@rohit-constellation/types';
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
  const [isLoadingNextQuestion, setIsLoadingNextQuestion] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // Ref to hold the latest participantId
  const participantIdRef = useRef(participantId);

  // Log when the component body renders to track re-renders and initial prop/hook values
  // console.log('[ActiveSession] Component body render. SessionId:', sessionId, 'ParticipantId (from useSession):', participantId, 'Navigate fn defined:', !!navigate);

  // Effect to update the ref when participantId changes
  useEffect(() => {
    participantIdRef.current = participantId;
  }, [participantId]);

  // Effect for initializing participantId from localStorage
  useEffect(() => {
    if (!participantId) {
      const storedParticipant = localStorage.getItem("session_participant");
      if (storedParticipant) {
        try {
          const parsedParticipant = JSON.parse(storedParticipant);
          if (parsedParticipant && parsedParticipant.id) {
            setParticipantId(parsedParticipant.id);
          }
        } catch (e) {
          // console.error("Error parsing session_participant from localStorage", e);
          localStorage.removeItem("session_participant");
        }
      }
    }
  }, [participantId, setParticipantId]);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      // console.log('[ActiveSession] WebSocket listeners EFFECT - SKIPPING (no sessionId)');
      return;
    }
    // console.log('[ActiveSession] WebSocket listeners EFFECT RUNNING for session:', sessionId, 'Current navigate fn defined:', !!navigate);

    // Check if websocketService has an `isConnected` property or similar
    // to prevent calling connect if already connected or connecting.
    // This is a hypothetical addition, depends on websocketService's API:
    // if (!websocketService.isConnected() && !websocketService.isConnecting()) {
    //   websocketService.connect(sessionId);
    // } else {
    //   console.log('[ActiveSession] WebSocket connect skipped, already connected/connecting for session:', sessionId);
    // }
    websocketService.connect(sessionId); // Current behavior

    // Define handlers INSIDE the effect so they capture the current sessionId
    // and other values from this effect's scope.
    const effectHandleSessionState = (state: SessionState) => {
      setSessionState(state);
      if (state.status === 'COMPLETED') {
        navigate(`/session/${sessionId}/results`); // sessionId from effect scope
      }
      const self = state.participants.find(p => p.id === participantIdRef.current);
      if (self?.status === 'COMPLETED') {
        setIsCompleted(true);
        setCurrentQuestion(null);
        setIsLoadingNextQuestion(false);
      }
    };

    const effectHandleQuestionReady = ({ question }: { question: Question }) => {
      // console.log('[ActiveSession] effectHandleQuestionReady CALLED. New question:', question);
      setCurrentQuestion(question);
      setIsLoadingNextQuestion(prevState => {
        // console.log('[ActiveSession] setIsLoadingNextQuestion in effectHandleQuestionReady. Old val:', prevState, 'New val:', false);
        return false;
      });
      console.log("question ready")
      setIsCompleted(false);
      // console.log('[ActiveSession] effectHandleQuestionReady FINISHED.');
    };

    const effectHandleParticipantStatus = (payload: { participantId: string, status: ParticipantStatus }) => {
      if (payload.participantId === participantIdRef.current && payload.status === 'COMPLETED') {
        console.log('[ActiveSession] Participant status is COMPLETED via effectHandle.');
        setIsCompleted(true);
        setCurrentQuestion(null);
        setIsLoadingNextQuestion(false);
      }
    };

    websocketService.onSessionStateUpdate(effectHandleSessionState);
    websocketService.onQuestionReady(effectHandleQuestionReady);
    websocketService.on(SESSION_EVENT.PARTICIPANT_STATUS, effectHandleParticipantStatus);

    return () => {
      console.log('[ActiveSession] Cleaning up WebSocket listeners for session:', sessionId);
      // It's crucial that removeAllListeners or specific removal works correctly.
      // If events are bound with these new anonymous functions, ensure they can be removed.
      // Often, websocket libraries require the exact same function reference for removal.
      // If websocketService.removeAllListeners() generically clears all for a type, it's fine.
      // Consider a cleanup that removes these specific handlers if the library supports it
      // and if removeAllListeners is too broad or has issues.
      websocketService.removeAllListeners(); 
    };
  }, [sessionId]); // New dependencies: Only sessionId. `navigate` is stable and accessed via closure in effectHandleSessionState.

  const fetchNextQuestion = useCallback(() => {
    if (sessionId && participantIdRef.current && !isCompleted && !currentQuestion) {
      // console.log('(fetchNextQuestion) Emitting GET_QUESTION for participant:', participantIdRef.current);
      setIsLoadingNextQuestion(true);
      websocketService.emit(SESSION_EVENT.GET_QUESTION, { sessionId, participantId: participantIdRef.current });
    }
  }, [sessionId, isCompleted, currentQuestion]);

  useEffect(() => {
    if (participantId && !isLoadingNextQuestion && !currentQuestion && !isCompleted) {
      // console.log('[ActiveSession] Attempting to fetch initial question (participantId available).');
      fetchNextQuestion();
    }
  }, [participantId, isLoadingNextQuestion, currentQuestion, isCompleted, fetchNextQuestion]);

  const handleSubmitAnswer = async () => {
    if (!currentAnswer.trim() || !currentQuestion?.id || !participantIdRef.current) {
      return;
    }
    
    setError(null); 
    setIsLoadingNextQuestion(true);
    
    try {
      const ack = await websocketService.submitAnswer(currentQuestion.id, currentAnswer, participantIdRef.current);
      console.log('[ActiveSession] Answer submission acknowledged by server:', ack);
      setCurrentAnswer(''); 

      // setIsLoadingNextQuestion(true); // REMOVED FROM HERE
      // console.log('[ActiveSession] isLoadingNextQuestion SET TO TRUE (after ack, awaiting server push for next Q)');
      // DO NOT call fetchNextQuestion() here anymore.
      // The server will proactively push QUESTION_READY if a next question exists.

    } catch (err: any) {
      // console.error('[ActiveSession] Error submitting answer or processing ack:', err);
      setError(err?.message || 'Failed to submit answer. Please try again.');
      setIsLoadingNextQuestion(false); 
    }
  };

  const handleUpvote = (answerId: string) => {
    try {
      websocketService.emit('session:question:answer:upvote', { answerId });
    } catch (err) {
      // console.error('Error upvoting answer:', err);
    }
  };

  // console.log(
  //   '[ActiveSession] Rendering - isLoadingNextQuestion:', isLoadingNextQuestion, 
  //   'isCompleted:', isCompleted, 
  //   'currentQuestion:', currentQuestion ? currentQuestion.id : null, 
  //   'currentQuestionText:', currentQuestion ? currentQuestion.text.substring(0,20) : null, 
  //   'sessionStatus:', sessionState?.status
  // );

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

  if (!sessionState || (!currentQuestion && !isLoadingNextQuestion && !isCompleted)) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="bg-white rounded-lg shadow p-8">
          <div className="text-center text-gray-500">
            {!sessionState ? 'Loading session...' : (isCompleted ? 'All questions completed!' : 'Loading question...')}
          </div>
        </div>
      </div>
    );
  }
  
  if (isCompleted) {
    return (
        <div className="max-w-4xl mx-auto py-10">
            <div className="bg-white rounded-lg shadow p-8 text-center">
                <h1 className="text-2xl font-bold mb-4 text-green-600">Great job!</h1>
                <p className="text-lg text-gray-700">You have completed all questions for this session.</p>
            </div>
        </div>
    );
  }

  if (isLoadingNextQuestion) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-lg font-semibold text-gray-700">Analyzing response and getting next question...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10">
      <div className="bg-white rounded-lg shadow p-8 mb-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">{currentQuestion?.text || 'Loading question...'}</h1>
            {/* {sessionState && (
                <div className="text-sm text-gray-500">
                {sessionState.participants.length} participants • {answers.length} answers
                </div>
            )} */}
          </div>
          {isHost && (
            <button
              className="px-4 py-2 rounded bg-blue-600 text-white font-semibold"
              onClick={() => websocketService.nextQuestion()}
            >
              Next Question (Admin)
            </button>
          )}
        </div>

        {currentQuestion && (
          <div className="mb-8">
            <textarea
              className="w-full border rounded-lg p-4 mb-2 min-h-[100px] resize-none"
              placeholder="Type your answer here..."
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              disabled={isLoadingNextQuestion || isCompleted}
            />
            <div className="flex justify-end">
              <button
                className="px-6 py-2 rounded bg-blue-600 text-white font-semibold disabled:bg-gray-400"
                disabled={!currentAnswer.trim() || isLoadingNextQuestion || isCompleted}
                onClick={handleSubmitAnswer}
              >
                Submit Answer
              </button>
            </div>
          </div>
        )}
        <div className="space-y-4 mt-8">
          {answers.map((answer) => (
            <div key={answer.id} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold text-gray-700">{answer.participantName || 'Anonymous'}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(answer.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
              <p className="text-gray-800 whitespace-pre-wrap">{answer.content}</p>
            </div>
          ))}
          {/* {answers.length === 0 && currentQuestion && !isLoadingNextQuestion && (
            <div className="text-center text-gray-500 py-8">
              No answers submitted for this question yet.
            </div>
          )} */}
        </div>
      </div>

      {sessionState && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-semibold mb-4">Participants ({sessionState.participants.length})</h2>
          <ul className="space-y-2">
            {sessionState.participants.map((participant) => (
              <li key={participant.id} className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${participant.status === 'ACTIVE' ? 'bg-green-500' : (participant.status === 'COMPLETED' ? 'bg-blue-500' : 'bg-gray-400')}`}></div>
                <span className="text-sm text-gray-700">{participant.name}</span>
                {participant.isHost && (
                  <span className="ml-1 text-xs bg-gray-200 text-gray-700 rounded px-1.5 py-0.5">Host</span>
                )}
                 <span className="text-xs text-gray-500">({participant.status?.toLowerCase()})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}; 