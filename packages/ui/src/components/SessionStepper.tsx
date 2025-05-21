import React, { useState } from 'react';
import { SessionSetup } from './SessionSetup';
import { ParticipationStep } from './ParticipationStep';
import { PreviewStep } from './PreviewStep';
import { LaunchStep } from './LaunchStep';
import { JoinSession } from './JoinSession';

export interface SessionData {
  template?: string;
  title?: string;
  description?: string;
  duration?: number;
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
  const [step, setStep] = useState(0);
  const [sessionData, setSessionData] = useState<SessionData>({
    anonymous: true,
    permissions: {
      askQuestions: true,
      reactUpvote: true,
      seeResponses: true,
    },
  });
  const [participantStep, setParticipantStep] = useState(false);
  const [participantName, setParticipantName] = useState('');
  const [participantRole, setParticipantRole] = useState('');
  const [participantSubmitted, setParticipantSubmitted] = useState(false);

  // Handlers to update session data from each step
  const handleSessionSetupContinue = (data: { template: string; title: string }) => {
    setSessionData((prev) => ({ ...prev, template: data.template, title: data.title }));
    setStep(1);
  };

  // For participation, just advance the step, since state is already updated
  const handleParticipationContinue = () => {
    setStep(2);
  };

  const handleLaunchContinue = () => {
    setStep(4);
  };

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
      {participantStep && (
        <JoinSession
          name={participantName}
          role={participantRole}
          setName={setParticipantName}
          setRole={setParticipantRole}
          submitted={participantSubmitted}
          setSubmitted={setParticipantSubmitted}
        />
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
            <LaunchStep onBack={() => setStep(2)} onContinue={handleLaunchContinue} />
          )}
          {step === 4 && (
            <div className="max-w-4xl mx-auto py-10">
              <h1 className="text-3xl font-bold mb-6">Waiting for participants</h1>
              <div className="bg-white rounded-lg shadow p-8 flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  <div className="mb-4 font-semibold text-lg">Share this link or QR code with participants to join the session</div>
                  <div className="mb-4">
                    <input
                      className="w-full border rounded px-3 py-2 font-mono text-sm bg-gray-100"
                      value="https://your-session-link.com/join/123456"
                      readOnly
                    />
                  </div>
                  <button className="px-6 py-2 rounded bg-blue-600 text-white font-semibold">Copy Join Link</button>
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
                  <ul className="text-sm text-gray-700">
                    <li>Sarah Parker <span className="ml-2 text-xs bg-gray-200 rounded px-2 py-0.5">Host</span></li>
                    <li>Sam Taylor</li>
                    <li>Jordan Williams</li>
                    <li>Casey Brown</li>
                    <li>Riley Davis</li>
                    <li>Morgan Lee</li>
                    <li>Quinn Miller</li>
                    <li>Avery Martinez</li>
                    <li>Alex Johnson</li>
                  </ul>
                </div>
              </div>
              <div className="mt-12 bg-white rounded-lg shadow p-6 flex items-center justify-between">
                <div>
                  <div className="font-bold text-lg mb-1">Ready to Start?</div>
                  <div className="text-gray-500 text-sm">Once you start the session, all participants will be able to join and answer questions.</div>
                </div>
                <button className="px-6 py-2 rounded bg-blue-600 text-white font-semibold flex items-center"><span className="mr-2">▶</span> Start Session</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}; 