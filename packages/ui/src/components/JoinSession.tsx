import React, { useState } from 'react';

export const JoinSession: React.FC = () => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [submitted, setSubmitted] = useState(false);

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
              className="w-full px-6 py-2 rounded bg-blue-600 text-white font-semibold"
              disabled={!name || !role}
              onClick={() => setSubmitted(true)}
            >
              Submit
            </button>
          </>
        ) : (
          <div className="text-center text-lg font-semibold text-gray-700">Waiting for admin to start a session...</div>
        )}
      </div>
    </div>
  );
}; 