import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import { fetchOwnerDocumentsSummary } from '../utils/apiClient';
import './NotaryWorkspacePages.css';

const normalize = (value) => String(value || '').trim().toLowerCase();

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const OwnerMeetingsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState([]);
  const [selectedPastSession, setSelectedPastSession] = useState(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState('notary');

  const handleOpenPastSessionDetails = (row) => {
    setSelectedPastSession(row);
    setActiveDetailsTab('notary');
  };

  const handleClosePastSessionDetails = () => {
    setSelectedPastSession(null);
    setActiveDetailsTab('notary');
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetchOwnerDocumentsSummary({});
        if (!active) return;
        setDocuments(Array.isArray(response) ? response : []);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load meetings');
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
      const scheduledTime = doc.scheduledAt ? new Date(doc.scheduledAt).getTime() : null;

      if (status === 'session_started') {
        current.push(doc);
      } else if (scheduledTime && !Number.isNaN(scheduledTime) && scheduledTime > now && status !== 'rejected') {
        upcoming.push(doc);
      } else if (doc.sessionId || doc.scheduledAt || doc.notarizedAt) {
        past.push(doc);
      }
    }

    const sortByScheduleDesc = (a, b) => {
      const aTime = new Date(a.scheduledAt || a.updatedAt || a.uploadedAt || 0).getTime();
      const bTime = new Date(b.scheduledAt || b.updatedAt || b.uploadedAt || 0).getTime();
      return bTime - aTime;
    };

    return {
      current: [...current].sort(sortByScheduleDesc),
      upcoming: [...upcoming].sort(sortByScheduleDesc),
      past: [...past].sort(sortByScheduleDesc),
    };
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
              <th>Notary</th>
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
                <td>{row.notaryName || '-'}</td>
                <td>{row.sessionId || '-'}</td>
                <td>{formatDate(row.scheduledAt)}</td>
                <td>
                  <span className={`status-chip ${type}`}>
                    {row.status || row.notaryReview || type}
                  </span>
                </td>
                <td>
                  {row.sessionId ? (
                    <button
                      className="notary-btn secondary"
                      onClick={() => {
                        if (type === 'past') {
                          handleOpenPastSessionDetails(row);
                        } else {
                          navigate(`/signer?sessionId=${encodeURIComponent(row.sessionId)}&role=signer`);
                        }
                      }}
                    >
                      {type === 'past' ? 'View' : 'Open Session'}
                    </button>
                  ) : (
                    <button className="notary-btn secondary" onClick={() => navigate('/signer/doc/dashboard')}>
                      View Docs
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
      sidebarRole="signer"
      title="Meetings"
      subtitle="Track your current, upcoming, and past notarization sessions"
    >
      <div className="page-stack">
        <section className="notary-card">
          <div className="notary-card-body">
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))' }}>
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
      {selectedPastSession && (
        <SessionDetailsModal
          session={selectedPastSession}
          activeTab={activeDetailsTab}
          onChangeTab={setActiveDetailsTab}
          onClose={handleClosePastSessionDetails}
          recordings={[]}
          recordingsLoading={false}
          recordingsError={''}
        />
      )}
    </NotaryWorkspaceShell>
  );
};

const SessionDetailsModal = ({
  session,
  activeTab,
  onChangeTab,
  onClose,
  recordings,
  recordingsLoading,
  recordingsError,
}) => {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!session) return null;

  const latestRecording = Array.isArray(recordings) && recordings.length > 0 ? recordings[0] : null;
  const recordingUrl = latestRecording?.shareUrl || latestRecording?.providerUrl || '';
  const meetingTitle = session?.sessionId || 'Unknown meeting';
  const meetingStatus = session?.status || session?.notaryReview || '-';

  const formatDuration = (durationMs) => {
    const ms = Number(durationMs || 0);
    if (!Number.isFinite(ms) || ms <= 0) return '-';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  };

  return (
    <div
      className="session-details-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Session details"
      onClick={onClose}
    >
      <div className="session-details-panel" onClick={(e) => e.stopPropagation()}>
        <div className="session-details-header">
          <button type="button" className="session-details-close" onClick={onClose} aria-label="Close details">
            Close
          </button>
          <h3>Notarization details</h3>
        </div>

        <div className="session-details-tabs" role="tablist" aria-label="Session detail tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'notary'}
            className={activeTab === 'notary' ? 'active' : ''}
            onClick={() => onChangeTab('notary')}
          >
            NOTARY
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'video'}
            className={activeTab === 'video' ? 'active' : ''}
            onClick={() => onChangeTab('video')}
          >
            VIDEO
          </button>
        </div>

        <div className="session-details-body">
          {activeTab === 'notary' ? (
            <div className="session-notary-content">
              <h4>
                Meeting - {meetingTitle}
                <span>{formatDate(session?.notarizedAt || session?.scheduledAt || latestRecording?.createdAt || session?.updatedAt)}</span>
              </h4>

              <div className="session-field-grid">
                <div>
                  <p className="label">Notarial act</p>
                  <p>Jurat</p>
                </div>
                <div>
                  <p className="label">Notary public</p>
                  <p>{session?.notaryName || 'Notary'}</p>
                </div>
                <div>
                  <p className="label">Signer</p>
                  <p>{session?.ownerName || session?.ownerId || '-'}</p>
                </div>
                <div>
                  <p className="label">Platform</p>
                  <p>MOBILE_WEB</p>
                </div>
                <div>
                  <p className="label">Meeting status</p>
                  <p className="status-ok">Completed ({meetingStatus})</p>
                </div>
                <div>
                  <p className="label">Session duration</p>
                  <p>{formatDuration(latestRecording?.durationMs)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="session-video-content">
              {recordingsLoading ? <p className="muted">Loading recording...</p> : null}
              {recordingsError ? <p className="muted">{recordingsError}</p> : null}
              {!recordingsLoading && !recordingsError && !recordingUrl ? (
                <div className="empty-block">No recording available for this session.</div>
              ) : null}
              {!recordingsLoading && !recordingsError && recordingUrl ? (
                <div>
                  <div className="session-video-player">Video URL: {recordingUrl}</div>
                  <a
                    className="session-video-link notary-btn secondary"
                    href={recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Watch Recording
                  </a>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OwnerMeetingsPage;
