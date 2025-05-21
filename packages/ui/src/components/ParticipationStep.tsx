import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import type { SessionData } from './SessionStepper';

const participationOptions = [
  { key: 'anyone', label: 'Anyone with link', description: 'Open access to all participants', icon: '🌐' },
  { key: 'emails', label: 'Specific emails', description: 'Invite specific participants', icon: '✉️' },
  { key: 'team', label: 'Team members', description: 'Limit to specific teams', icon: '👥' },
];

export const ParticipationStep: React.FC<{
  onBack: () => void;
  onContinue: () => void;
  data: SessionData;
  setData: React.Dispatch<React.SetStateAction<SessionData>>;
}> = ({ onBack, onContinue, data, setData }) => {
  const canContinue = !!data.participationRule;

  const handleContinue = () => {
    if (canContinue) {
      onContinue();
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-8">
          <div className="flex flex-col items-center opacity-50">
            <div className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center font-bold">1</div>
            <span className="text-xs mt-2">Session Setup</span>
          </div>
          <div className="w-32 h-1 bg-gray-200 rounded" />
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full border-2 border-blue-500 flex items-center justify-center text-blue-600 font-bold">2</div>
            <span className="text-xs mt-2 text-blue-600 font-medium">Participation</span>
          </div>
          <div className="w-32 h-1 bg-gray-200 rounded" />
          <div className="flex flex-col items-center opacity-50">
            <div className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center font-bold">3</div>
            <span className="text-xs mt-2">Preview</span>
          </div>
          <div className="w-32 h-1 bg-gray-200 rounded" />
          <div className="flex flex-col items-center opacity-50">
            <div className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center font-bold">4</div>
            <span className="text-xs mt-2">Launch</span>
          </div>
        </div>
      </div>
      <Card className="p-8">
        <h2 className="text-2xl font-bold mb-2 text-center">Participation Rules</h2>
        <p className="text-center text-gray-500 mb-8">Configure how participants will interact with your session</p>
        <div className="mb-8">
          <div className="text-lg font-semibold mb-2">Who can join this session?</div>
          <div className="flex space-x-4 mb-6 justify-center">
            {participationOptions.map(opt => (
              <div
                key={opt.key}
                className={`flex flex-col items-center border rounded-lg p-4 w-48 cursor-pointer ${data.participationRule === opt.key ? 'border-blue-500 ring-2 ring-blue-200' : 'hover:border-blue-500'}`}
                onClick={() => setData(prev => ({ ...prev, participationRule: opt.key }))}
              >
                <div className="text-2xl mb-2">{opt.icon}</div>
                <div className="font-medium">{opt.label}</div>
                <div className="text-xs text-gray-500">{opt.description}</div>
                {data.participationRule === opt.key && (
                  <div className="mt-2 text-xs text-blue-600 font-semibold">Selected</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mb-8">
          <div className="text-lg font-semibold mb-2">Participant Permissions</div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Ask their own questions</div>
                <div className="text-xs text-gray-500">Allow participants to submit new questions</div>
              </div>
              <input
                type="checkbox"
                checked={!!data.permissions?.askQuestions}
                onChange={e => setData(prev => ({
                  ...prev,
                  permissions: {
                    askQuestions: e.target.checked,
                    reactUpvote: prev.permissions?.reactUpvote ?? true,
                    seeResponses: prev.permissions?.seeResponses ?? true,
                  }
                }))}
                className="form-checkbox h-5 w-5 text-blue-600"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">React and upvote</div>
                <div className="text-xs text-gray-500">Allow participants to react to others' responses</div>
              </div>
              <input
                type="checkbox"
                checked={!!data.permissions?.reactUpvote}
                onChange={e => setData(prev => ({
                  ...prev,
                  permissions: {
                    askQuestions: prev.permissions?.askQuestions ?? true,
                    reactUpvote: e.target.checked,
                    seeResponses: prev.permissions?.seeResponses ?? true,
                  }
                }))}
                className="form-checkbox h-5 w-5 text-blue-600"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">See others' responses</div>
                <div className="text-xs text-gray-500">Allow participants to view all responses</div>
              </div>
              <input
                type="checkbox"
                checked={!!data.permissions?.seeResponses}
                onChange={e => setData(prev => ({
                  ...prev,
                  permissions: {
                    askQuestions: prev.permissions?.askQuestions ?? true,
                    reactUpvote: prev.permissions?.reactUpvote ?? true,
                    seeResponses: e.target.checked,
                  }
                }))}
                className="form-checkbox h-5 w-5 text-blue-600"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-between">
          <Button variant="secondary" size="md" onClick={onBack}>Back</Button>
          <Button variant="primary" size="md" onClick={handleContinue} disabled={!canContinue}>Continue</Button>
        </div>
      </Card>
    </div>
  );
}; 