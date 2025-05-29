import React, { createContext, useContext, useState, useEffect } from 'react';

interface SessionContextType {
  participantId: string | null;
  setParticipantId: (id: string | null) => void;
  // Extend with more fields as needed
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [participantId, setParticipantIdState] = useState<string | null>(() => {
    // Load from localStorage if available
    return localStorage.getItem('participantId');
  });

  // Persist to localStorage
  useEffect(() => {
    if (participantId) {
      localStorage.setItem('participantId', participantId);
    } else {
      localStorage.removeItem('participantId');
    }
  }, [participantId]);

  const setParticipantId = (id: string | null) => {
    setParticipantIdState(id);
  };

  return (
    <SessionContext.Provider value={{ participantId, setParticipantId }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}; 