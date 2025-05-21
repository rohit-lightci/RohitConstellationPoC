import React, { useState } from 'react';
import { Accordion } from './Accordion/index';
import { Card } from './Card';
import { Button } from './Button';
import type { SessionData } from './SessionStepper';

const templateOptions = [
  {
    title: 'Mad, Sad, Glad Retrospective',
    description: 'A classic retrospective format to capture team emotions and experiences.',
    questions: 3,
  },
  {
    title: 'Start, Stop, Continue',
    description: 'Focus on actionable changes for team improvement.',
    questions: 3,
  },
];

export const SessionSetup: React.FC<{
  onContinue?: (data: { template: string; title: string }) => void;
  data: SessionData;
  setData: React.Dispatch<React.SetStateAction<SessionData>>;
}> = ({ onContinue, data, setData }) => {
  const [hasAttemptedContinue, setHasAttemptedContinue] = useState(false);

  const canContinue = !!data.template && !!data.title?.trim();

  const handleContinue = () => {
    setHasAttemptedContinue(true);
    if (canContinue) {
      onContinue?.({ template: data.template!, title: data.title! });
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-8">
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full border-2 border-blue-500 flex items-center justify-center text-blue-600 font-bold">1</div>
            <span className="text-xs mt-2 text-blue-600 font-medium">Session Setup</span>
          </div>
          <div className="w-32 h-1 bg-gray-200 rounded" />
          <div className="flex flex-col items-center opacity-50">
            <div className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center font-bold">2</div>
            <span className="text-xs mt-2">Participation</span>
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
        <h2 className="text-2xl font-bold mb-2 text-center">Session Setup</h2>
        <p className="text-center text-gray-500 mb-8">Define your session type, template, and details</p>
        <div className="space-y-6">
          <Accordion
            items={[
              {
                title: 'Select a Template',
                content: (
                  <div>
                    <div className="mb-6">
                      <label className="block text-sm font-medium mb-2">Session Type</label>
                      <select className="w-full border rounded px-3 py-2">
                        <option>Retrospective</option>
                        <option>Market Survey</option>
                        <option>Brainstorming</option>
                      </select>
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-2">Select a Template</label>
                      <div className="flex space-x-4 mb-2">
                        <button className="px-4 py-2 rounded bg-gray-100 text-gray-700">All</button>
                        <button className="px-4 py-2 rounded text-gray-500">Team</button>
                        <button className="px-4 py-2 rounded text-gray-500">Process</button>
                        <button className="px-4 py-2 rounded text-gray-500">Product</button>
                        <button className="px-4 py-2 rounded text-gray-500">Custom</button>
                      </div>
                      <div className="flex space-x-4">
                        {templateOptions.map((tpl) => (
                          <Card
                            key={tpl.title}
                            className={`w-72 p-4 cursor-pointer border ${data.template === tpl.title ? 'border-blue-500 ring-2 ring-blue-200' : 'hover:border-blue-500'}`}
                            onClick={() => setData((prev) => ({ ...prev, template: tpl.title }))}
                          >
                            <div className="font-semibold mb-1">{tpl.title}</div>
                            <div className="text-gray-500 text-sm mb-2">{tpl.description}</div>
                            <div className="text-xs text-gray-400">{tpl.questions} questions</div>
                            {data.template === tpl.title && (
                              <div className="mt-2 text-xs text-blue-600 font-semibold">Selected</div>
                            )}
                          </Card>
                        ))}
                      </div>
                      {hasAttemptedContinue && !data.template && (
                        <div className="mt-2 text-red-500 text-sm">Please select a template</div>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                title: 'Session Details',
                content: (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium mb-2">Session Title</label>
                      <input
                        className={`w-full border rounded px-3 py-2 ${hasAttemptedContinue && !data.title?.trim() ? 'border-red-500' : ''}`}
                        placeholder="Enter a clear title for your session"
                        value={data.title || ''}
                        onChange={e => setData((prev) => ({ ...prev, title: e.target.value }))}
                      />
                      {hasAttemptedContinue && !data.title?.trim() && (
                        <div className="mt-1 text-red-500 text-sm">Please enter a session title</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Description (Optional)</label>
                      <textarea
                        className="w-full border rounded px-3 py-2"
                        placeholder="Describe the purpose of this session"
                        value={data.description || ''}
                        onChange={e => setData((prev) => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Session Duration (minutes)</label>
                      <input
                        type="number"
                        className="w-full border rounded px-3 py-2"
                        value={data.duration || 60}
                        min={15}
                        max={120}
                        onChange={e => setData((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                      />
                      <div className="text-xs text-gray-400 mt-1">Enter a duration between 15 and 120 minutes</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" checked={!!data.anonymous} readOnly className="form-checkbox h-4 w-4 text-blue-600" />
                      <span className="text-sm">Anonymous Responses <span className="text-gray-400">Participants' identities will not be visible</span></span>
                    </div>
                    <div>
                      <button className="border rounded px-4 py-2 text-sm">Upload past session or additional context</button>
                    </div>
                  </div>
                ),
              },
            ]}
            defaultOpenIndices={[0, 1]}
          />
          <div className="flex justify-end mt-6">
            <Button
              variant="primary"
              size="md"
              onClick={handleContinue}
              disabled={!canContinue}
            >
              Continue
            </Button>
          </div>
          {hasAttemptedContinue && !canContinue && (
            <div className="text-center text-red-500 text-sm mt-2">
              Please select a template and enter a session title to continue
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}; 