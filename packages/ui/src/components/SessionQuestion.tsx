import React, { useState } from 'react';

export const SessionQuestion: React.FC = () => {
  const [answer, setAnswer] = useState('');
  const [clarification, setClarification] = useState(false);

  return (
    <div className="max-w-5xl mx-auto py-10">
      <div className="text-2xl font-bold mb-2">aaa</div>
      <div className="w-full h-3 bg-gray-200 rounded mb-2">
        <div className="h-3 bg-blue-500 rounded" style={{ width: '25%' }} />
      </div>
      <div className="flex justify-between text-sm text-gray-600 mb-6">
        <div>Question 1 of 4</div>
        <div>🕒 55:10</div>
      </div>
      <div className="flex justify-between text-sm text-gray-600 mb-8">
        <div>⏱️ Avg. response: <span className="font-semibold">8.2s</span></div>
        <div>👥 Participation: <span className="font-semibold">85%</span></div>
        <div>👤 Active participants: <span className="font-semibold">12</span></div>
      </div>
      <div className="flex gap-8">
        <div className="flex-1 bg-white rounded-xl shadow p-8">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xl font-semibold">What made you mad during this sprint?</div>
            {/* <div className="flex items-center gap-2 text-blue-600 text-sm">
              <span>Request clarification</span>
              <label className="inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={clarification} onChange={e => setClarification(e.target.checked)} />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-500 transition-all" />
                <div className="absolute w-4 h-4 bg-white rounded-full shadow -ml-8 mt-0.5 peer-checked:translate-x-4 transition-all" />
              </label>
            </div> */}
          </div>
          <textarea
            className="w-full border rounded p-4 min-h-[120px] mb-2 resize-none"
            placeholder="Enter your answer here..."
            value={answer}
            onChange={e => setAnswer(e.target.value)}
          />
          <div className="flex justify-between items-center text-xs text-gray-400 mb-2">
            <span>Take your time to reflect</span>
            <span>{answer.length} characters</span>
          </div>
          <button
            className="w-full px-6 py-2 rounded bg-blue-500 text-white font-semibold disabled:opacity-50"
            disabled={!answer.trim()}
          >
            Submit
          </button>
        </div>
        <div className="w-72 bg-white rounded-xl shadow p-6 flex flex-col items-center">
          <div className="font-semibold mb-2">Session Progress</div>
          <div className="w-full h-2 bg-gray-200 rounded mb-2">
            <div className="h-2 bg-blue-500 rounded" style={{ width: '25%' }} />
          </div>
          <div className="text-xs text-gray-600">Questions: 1/4</div>
          <div className="text-xs text-gray-600">25%</div>
        </div>
      </div>
    </div>
  );
}; 