import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import type { SessionData } from './SessionStepper';

export const PreviewStep: React.FC<{
  onBack: () => void;
  onContinue: () => void;
  data: SessionData;
}> = ({ onBack, onContinue, data }) => {
  return (
    <div className="max-w-3xl mx-auto py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-8">
          <div className="flex flex-col items-center opacity-50">
            <div className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center font-bold">1</div>
            <span className="text-xs mt-2">Session Setup</span>
          </div>
          <div className="w-32 h-1 bg-gray-200 rounded" />
          <div className="flex flex-col items-center opacity-50">
            <div className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center font-bold">2</div>
            <span className="text-xs mt-2">Participation</span>
          </div>
          <div className="w-32 h-1 bg-gray-200 rounded" />
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full border-2 border-blue-500 flex items-center justify-center text-blue-600 font-bold">3</div>
            <span className="text-xs mt-2 text-blue-600 font-medium">Preview</span>
          </div>
          <div className="w-32 h-1 bg-gray-200 rounded" />
          <div className="flex flex-col items-center opacity-50">
            <div className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center font-bold">4</div>
            <span className="text-xs mt-2">Launch</span>
          </div>
        </div>
      </div>
      <Card className="p-8">
        <h2 className="text-2xl font-bold mb-2 text-center">Preview Your Session</h2>
        <p className="text-center text-gray-500 mb-8">Review how your session will appear to participants</p>
        <div className="mb-8 space-y-4">
          <div>
            <span className="font-semibold">Template:</span> {data.template}
          </div>
          <div>
            <span className="font-semibold">Title:</span> {data.title}
          </div>
          {data.description && (
            <div>
              <span className="font-semibold">Description:</span> {data.description}
            </div>
          )}
          <div>
            <span className="font-semibold">Duration:</span> {data.duration} minutes
          </div>
          <div>
            <span className="font-semibold">Anonymous:</span> {data.anonymous ? 'Yes' : 'No'}
          </div>
          <div>
            <span className="font-semibold">Who can join:</span> {data.participationRule === 'anyone' ? 'Anyone with link' : data.participationRule === 'emails' ? 'Specific emails' : data.participationRule === 'team' ? 'Team members' : ''}
          </div>
          <div>
            <span className="font-semibold">Permissions:</span>
            <ul className="list-disc ml-6">
              <li>Ask questions: {data.permissions?.askQuestions ? 'Yes' : 'No'}</li>
              <li>React and upvote: {data.permissions?.reactUpvote ? 'Yes' : 'No'}</li>
              <li>See others' responses: {data.permissions?.seeResponses ? 'Yes' : 'No'}</li>
            </ul>
          </div>
        </div>
        <div className="flex justify-between">
          <Button variant="secondary" size="md" onClick={onBack}>Back</Button>
          <Button variant="primary" size="md" onClick={onContinue}>Proceed to Launch</Button>
        </div>
      </Card>
    </div>
  );
}; 