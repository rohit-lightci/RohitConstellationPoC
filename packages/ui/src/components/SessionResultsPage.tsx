import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Session } from '@rohit-constellation/types'; // Assuming Session type is available

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/v1';

const SessionResultsPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [sessionData, setSessionData] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      const fetchSessionData = async () => {
        setLoading(true);
        try {
          const response = await fetch(`${API_URL}/sessions/${sessionId}`);
          if (!response.ok) {
            throw new Error(`Failed to fetch session data: ${response.statusText}`);
          }
          const data: Session = await response.json();
          setSessionData(data);
          setError(null);
        } catch (err) {
          if (err instanceof Error) {
            setError(err.message);
          } else {
            setError('An unknown error occurred');
          }
          setSessionData(null);
        } finally {
          setLoading(false);
        }
      };

      fetchSessionData();
    }
  }, [sessionId]);

  if (loading) {
    return <div>Loading session results...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!sessionData) {
    return <div>No session data found.</div>;
  }

  let reportContent = <p>No report generated for this session.</p>;
  if (sessionData.generatedReportJson) {
    try {
      const report = JSON.parse(sessionData.generatedReportJson);
      // Basic rendering of the report. You might want to create a more structured display.
      reportContent = (
        <pre>{JSON.stringify(report, null, 2)}</pre>
      );
    } catch (e) {
      reportContent = <p>Error parsing report data.</p>;
      console.error('Error parsing generatedReportJson:', e);
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px' }}>Session Results: {sessionData.title}</h1>
      <div style={{ marginTop: '20px' }}>
        <h2>Session Details</h2>
        <p><strong>ID:</strong> {sessionData.id}</p>
        <p><strong>Status:</strong> {sessionData.status}</p>
        <p><strong>Template:</strong> {sessionData.template}</p>
        {sessionData.description && <p><strong>Description:</strong> {sessionData.description}</p>}
      </div>
      <div style={{ marginTop: '30px' }}>
        <h2>Generated Report</h2>
        {reportContent}
      </div>
    </div>
  );
};

export default SessionResultsPage;
