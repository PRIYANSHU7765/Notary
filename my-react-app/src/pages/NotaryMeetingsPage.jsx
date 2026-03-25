import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import { fetchOwnerDocuments, fetchSessionRecordings } from '../utils/apiClient';
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
  const [selectedPastSession, setSelectedPastSession] = useState(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState('notary');
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [recordingsError, setRecordingsError] = useState('');
  const [selectedSessionRecordings, setSelectedSessionRecordings] = useState([]);

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

  const handleOpenPastSessionDetails = async (row) => {
    const sessionId = String(row?.sessionId || '').trim();
    if (!sessionId) return;

    setSelectedPastSession(row);
    setActiveDetailsTab('notary');
    setRecordingsError('');
    setSelectedSessionRecordings([]);
    setRecordingsLoading(true);

    try {
      const recordings = await fetchSessionRecordings({ sessionId });
      setSelectedSessionRecordings(Array.isArray(recordings) ? recordings : []);
    } catch (err) {
      setRecordingsError(err?.message || 'Unable to load session recording');
    } finally {
      setRecordingsLoading(false);
    }
  };

  const handleClosePastSessionDetails = () => {
    setSelectedPastSession(null);
    setActiveDetailsTab('notary');
    setRecordingsLoading(false);
    setRecordingsError('');
    setSelectedSessionRecordings([]);
  };

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
              <th>Start Time</th>
              <th>End Time</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const startTime = row.startedAt || row.scheduledAt || row.startTime || row.startedDate;
              const endTime = row.endedAt || row.completedAt || row.endTime;

              return (
                <tr key={row.id}>
                  <td>{row.name || row.documentName || '-'}</td>
                  <td>{row.ownerName || row.ownerId || '-'}</td>
                  <td>{row.sessionId || '-'}</td>
                  <td>{formatDate(row.scheduledAt)}</td>
                  <td>{formatDate(startTime)}</td>
                  <td>{formatDate(endTime)}</td>
                  <td>{row.status || row.notaryReview || '-'}</td>
                <td>
                  {type === 'past' && row.sessionId ? (
                    <button
                      className="notary-btn"
                      onClick={() => handleOpenPastSessionDetails(row)}
                    >
                      View
                    </button>
                  ) : row.sessionId ? (
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
              );
            })}
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
              <div className="kpi-item">
                <p className="kpi-label">Quick Actions</p>
                <div className="inline-actions quick-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                  <button className="notary-btn" onClick={() => navigate('/notary/doc/dashboard')}>
                    Open Document Queue
                  </button>
                  <button className="notary-btn secondary" onClick={() => navigate('/notary')}>
                    Open Live Session Workspace
                  </button>
                </div>
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

            <SessionDetailsModal
              session={selectedPastSession}
              activeTab={activeDetailsTab}
              onChangeTab={setActiveDetailsTab}
              onClose={handleClosePastSessionDetails}
              recordings={selectedSessionRecordings}
              recordingsLoading={recordingsLoading}
              recordingsError={recordingsError}
            />
          </>
        ) : null}
      </div>
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
  if (!session) return null;

  React.useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session, onClose]);

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
                <span>{formatDate(session?.notarizedAt || session?.scheduledAt || latestRecording?.createdAt)}</span>
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
                  <p className="label">Owner</p>
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
              {!recordingsLoading && recordingsError ? <p className="muted">{recordingsError}</p> : null}
              {!recordingsLoading && !recordingsError && !latestRecording ? (
                <p className="muted">No recording found for this session.</p>
              ) : null}

              {!recordingsLoading && !recordingsError && latestRecording ? (
                <>
                  <p className="muted">
                    Recording: {latestRecording.fileName || 'session-recording'}
                    {latestRecording.createdAt ? ` • ${formatDate(latestRecording.createdAt)}` : ''}
                  </p>

                  {recordingUrl ? (
                    <video controls className="session-video-player" src={recordingUrl} preload="metadata">
                      Your browser does not support video playback.
                    </video>
                  ) : (
                    <p className="muted">Recording exists but no playable URL is available.</p>
                  )}

                  {recordingUrl ? (
                    <a className="notary-btn secondary session-video-link" href={recordingUrl} target="_blank" rel="noreferrer">
                      Open recording in new tab
                    </a>
                  ) : null}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotaryMeetingsPage;
