import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import { fetchOwnerDocuments } from '../utils/apiClient';
import './NotaryWorkspacePages.css';

const normalize = (value) => String(value || '').trim().toLowerCase();

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const NotaryMeetingsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetchOwnerDocuments({});
        if (!active) return;
        setDocuments(Array.isArray(response) ? response : []);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load meeting sessions');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const categorized = useMemo(() => {
    const now = Date.now();
    const current = [];
    const upcoming = [];
    const past = [];

    for (const doc of documents) {
      const status = normalize(doc.status || doc.notaryReview);
      const scheduleTime = doc.scheduledAt ? new Date(doc.scheduledAt).getTime() : null;

      if (status === 'session_started') {
        current.push(doc);
      } else if (scheduleTime && !Number.isNaN(scheduleTime) && scheduleTime > now && status !== 'notarized' && status !== 'rejected') {
        upcoming.push(doc);
      } else {
        past.push(doc);
      }
    }

    return { current, upcoming, past };
  }, [documents]);

  const renderMeetingTable = (rows, type) => {
    if (rows.length === 0) {
      return <div className="empty-block">No {type} sessions found.</div>;
    }

    return (
      <div className="notary-table-wrap">
        <table className="notary-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Owner</th>
              <th>Session ID</th>
              <th>Scheduled Time</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name || row.documentName || '-'}</td>
                <td>{row.ownerName || row.ownerId || '-'}</td>
                <td>{row.sessionId || '-'}</td>
                <td>{formatDate(row.scheduledAt)}</td>
                <td>{row.status || row.notaryReview || '-'}</td>
                <td>
                  {row.sessionId ? (
                    <button
                      className="notary-btn secondary"
                      onClick={() => navigate(`/notary?sessionId=${encodeURIComponent(row.sessionId)}&role=notary`)}
                    >
                      Open Session
                    </button>
                  ) : (
                    <button className="notary-btn secondary" onClick={() => navigate('/notary/doc/dashboard')}>
                      View Queue
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <NotaryWorkspaceShell
      title="Meetings"
      subtitle="Track current, upcoming, and past notarization sessions"
    >
      <div className="page-stack">
        <section className="notary-card">
          <div className="notary-card-body">
            <div className="kpi-grid">
              <div className="kpi-item">
                <p className="kpi-label">Current</p>
                <p className="kpi-value small">{categorized.current.length}</p>
              </div>
              <div className="kpi-item">
                <p className="kpi-label">Upcoming</p>
                <p className="kpi-value small">{categorized.upcoming.length}</p>
              </div>
              <div className="kpi-item">
                <p className="kpi-label">Past</p>
                <p className="kpi-value small">{categorized.past.length}</p>
              </div>
            </div>
          </div>
        </section>

        {loading ? <p className="muted">Loading meetings...</p> : null}
        {!loading && error ? <p className="muted">{error}</p> : null}

        {!loading && !error ? (
          <>
            <section className="notary-card">
              <div className="notary-card-header">Current Sessions</div>
              <div className="notary-card-body">{renderMeetingTable(categorized.current, 'current')}</div>
            </section>

            <section className="notary-card">
              <div className="notary-card-header">Upcoming Sessions</div>
              <div className="notary-card-body">{renderMeetingTable(categorized.upcoming, 'upcoming')}</div>
            </section>

            <section className="notary-card">
              <div className="notary-card-header">Past Sessions</div>
              <div className="notary-card-body">{renderMeetingTable(categorized.past, 'past')}</div>
            </section>
          </>
        ) : null}
      </div>
    </NotaryWorkspaceShell>
  );
};

export default NotaryMeetingsPage;
