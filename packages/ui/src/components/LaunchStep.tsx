import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import type { SessionData } from './SessionStepper';

const API_URL = 'http://localhost:3000/v1';

export const LaunchStep: React.FC<{ onBack: () => void; onContinue: () => void; sessionData: SessionData }> = ({ onBack, onContinue, sessionData }) => {
  const [loading, setLoading] = React.useState(false);

  const handleLaunch = async () => {
    setLoading(true);
    try {
      console.log('Sending session data to API:', sessionData);
      const response = await fetch(`${API_URL}/sessions/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      });
      if (response.ok) {
        const data = await response.json();
        alert('Session created! ID: ' + data.sessionId);
        onContinue();
      } else {
        alert('Failed to create session');
      }
    } catch (e) {
      alert('Error creating session');
    } finally {
      setLoading(false);
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
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full border-2 border-blue-500 flex items-center justify-center text-blue-600 font-bold">4</div>
            <span className="text-xs mt-2 text-blue-600 font-medium">Launch</span>
          </div>
        </div>
      </div>
      <Card className="p-8">
        <h2 className="text-2xl font-bold mb-2 text-center">Launch Options</h2>
        <p className="text-center text-gray-500 mb-8">Choose how you want to start your session</p>
        <div className="mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4 text-blue-700 text-center">
            <span className="font-semibold">Your session is ready to launch!</span> You can launch your session now or schedule it for later.
          </div>
          <div className="flex space-x-4 mb-4 justify-center">
            <button className="px-6 py-2 rounded bg-blue-600 text-white font-semibold" onClick={handleLaunch} disabled={loading}>Launch Now</button>
            <button className="px-6 py-2 rounded bg-gray-200 text-gray-700 font-semibold" disabled>Schedule for Later</button>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Welcome Message (Optional)</label>
            <input className="w-full border rounded px-3 py-2" placeholder="Add a welcome message for participants" />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Warm-up Question (Optional)</label>
            <input className="w-full border rounded px-3 py-2" placeholder="Add an ice-breaker question to get started" />
          </div>
          <div className="flex items-center space-x-2 mb-4">
            <input type="checkbox" checked readOnly className="form-checkbox h-4 w-4 text-blue-600" />
            <span className="text-sm">Auto-send invitations <span className="text-gray-400">Notify participants when session starts</span></span>
          </div>
        </div>
        <div className="flex justify-between">
          <Button variant="secondary" size="md" onClick={onBack} disabled={loading}>Back</Button>
          <Button variant="primary" size="md" onClick={handleLaunch} disabled={loading}>Launch Session Now</Button>
        </div>
      </Card>
    </div>
  );
}; 