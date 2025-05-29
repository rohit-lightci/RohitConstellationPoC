import React from 'react';

interface WaitingLobbyProps {
  sessionId: string;
  sessionState: any;
  sessionData: any;
  handleCopyLink: () => void;
  handleStartSession: () => void;
  handleEndSession: () => void;
}

export const WaitingLobby: React.FC<WaitingLobbyProps> = ({
  sessionId,
  sessionState,
  sessionData,
  handleCopyLink,
  handleStartSession,
  handleEndSession,
}) => {
  return (
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
            onClick={handleCopyLink}
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
              {sessionState.participants.map((participant: any) => (
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
          <div className="font-bold text-lg mb-1">
            {sessionState?.status === 'ACTIVE' ? 'Session in Progress' : 'Ready to Start?'}
          </div>
          <div className="text-gray-500 text-sm">
            {sessionState?.participants.length ? 
              `${sessionState.participants.filter((p: any) => p.status === 'ACTIVE')?.length} participants have joined.` :
              'Waiting for participants to join...'}
          </div>
        </div>
        {sessionState?.status === 'ACTIVE' ? (
          <button 
            className="px-6 py-2 rounded bg-red-600 text-white font-semibold flex items-center"
            onClick={handleEndSession}
          >
            <span className="mr-2">■</span> End Session
          </button>
        ) : (
          <button 
            className="px-6 py-2 rounded bg-blue-600 text-white font-semibold flex items-center disabled:bg-gray-400"
            disabled={!sessionState?.participants.length}
            onClick={handleStartSession}
          >
            <span className="mr-2">▶</span> Start Session
          </button>
        )}
      </div>
    </div>
  );
}; 