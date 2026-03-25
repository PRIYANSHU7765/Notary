import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import {
  fetchOwnerDocuments,
  fetchSessionRecordings,
  markOwnerDocumentSessionStarted,
  scheduleOwnerDocumentMeeting,
  updateOwnerDocumentReview,
} from '../utils/apiClient';
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
  const [saving, setSaving] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedulingDocId, setSchedulingDocId] = useState(null);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState('');
  const [selectedScheduleTime, setSelectedScheduleTime] = useState('');
  const [selectedPastSession, setSelectedPastSession] = useState(null);
  const [activeDetailsTab, setActiveDetailsTab] = useState('notary');
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [recordingsError, setRecordingsError] = useState('');
  const [selectedSessionRecordings, setSelectedSessionRecordings] = useState([]);

  const authUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {};
    } catch {
      return {};
    }
  }, []);

  const reloadDocuments = async () => {
    const response = await fetchOwnerDocuments({});
    setDocuments(Array.isArray(response) ? response : []);
  };

  useEffect(() => {
    let active = true;
    let pollInterval = null;

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

    // Set up polling to refresh documents every 5 seconds
    pollInterval = setInterval(() => {
      if (active) {
        reloadDocuments().catch(err => {
          console.warn('Failed to reload documents:', err);
        });
      }
    }, 5000);

    return () => {
      active = false;
      if (pollInterval) clearInterval(pollInterval);
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

      if (status === 'notarized' || status === 'rejected') {
        past.push(doc);
      } else if (scheduleTime && !Number.isNaN(scheduleTime) && scheduleTime > now) {
        upcoming.push(doc);
      } else {
        current.push(doc);
      }
    }

    return { current, upcoming, past };
  }, [documents]);

  const handleDecision = async (docId, decision) => {
    try {
      setSaving(true);
      const notaryName = authUser?.username || 'Notary';
      const updated = await updateOwnerDocumentReview(docId, decision, notaryName);
      setDocuments((prev) => prev.map((doc) => (doc.id === docId ? { ...doc, ...updated } : doc)));
    } catch (err) {
      setError(err?.message || 'Failed to update review status');
    } finally {
      setSaving(false);
    }
  };

  const handleScheduleMeeting = (doc) => {
    setSchedulingDocId(doc.id);
    setSelectedScheduleDate('');
    setSelectedScheduleTime('');
    setShowScheduleModal(true);
  };

  const handleConfirmSchedule = async () => {
    if (!schedulingDocId || !selectedScheduleDate || !selectedScheduleTime) {
      setError('Please select both schedule date and time');
      return;
    }

    try {
      setSaving(true);
      const scheduledAt = new Date(`${selectedScheduleDate}T${selectedScheduleTime}`).toISOString();
      const updated = await scheduleOwnerDocumentMeeting(schedulingDocId, scheduledAt);
      setDocuments((prev) => prev.map((doc) => (doc.id === schedulingDocId ? { ...doc, ...updated } : doc)));
      setShowScheduleModal(false);
      setSchedulingDocId(null);
      setSelectedScheduleDate('');
      setSelectedScheduleTime('');
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to schedule meeting');
    } finally {
      setSaving(false);
    }
  };

  const handleStartSession = async (doc) => {
    if (!doc?.id || !doc?.sessionId) {
      setError('Session is not available for this document');
      return;
    }

    try {
      setSaving(true);
      const updated = await markOwnerDocumentSessionStarted(
        doc.id,
        doc.sessionId,
        authUser?.username || 'Notary',
        authUser?.userId || authUser?.id || null
      );
      setDocuments((prev) => prev.map((item) => (item.id === doc.id ? { ...item, ...updated } : item)));
      navigate(`/notary?sessionId=${encodeURIComponent(doc.sessionId)}&role=notary&sessionStarted=true&documentId=${encodeURIComponent(doc.id)}`);
    } catch (err) {
      setError(err?.message || 'Failed to start session');
    } finally {
      setSaving(false);
    }
  };

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

  const renderActions = (row, type) => {
    const status = normalize(row.status || row.notaryReview);

    if (type === 'past') {
      if (!row.sessionId) return <span className="muted">-</span>;
      return (
        <button className="notary-btn" onClick={() => handleOpenPastSessionDetails(row)}>
          View
        </button>
      );
    }

    if (status === 'uploaded' || status === 'pending_review' || status === 'pending') {
      return (
        <div className="inline-actions" style={{ marginTop: 0 }}>
          <button className="notary-btn" disabled={saving} onClick={() => handleDecision(row.id, 'accepted')}>
            Accept
          </button>
          <button className="notary-btn secondary" disabled={saving} onClick={() => handleDecision(row.id, 'rejected')}>
            Reject
          </button>
        </div>
      );
    }

    const scheduledAtMs = row.scheduledAt ? new Date(row.scheduledAt).getTime() : null;
    const scheduledFuture = scheduledAtMs && Number.isFinite(scheduledAtMs) && Date.now() < scheduledAtMs;

    if (status === 'accepted') {
      return (
        <div className="inline-actions" style={{ marginTop: 0 }}>
          <button className="notary-btn" disabled={saving || scheduledFuture} onClick={() => handleStartSession(row)}>
            Start Session
          </button>
          <button className="notary-btn secondary" disabled={saving} onClick={() => handleScheduleMeeting(row)}>
            Schedule
          </button>
        </div>
      );
    }

    if (status === 'session_started' && row.sessionId) {
      return (
        <button className="notary-btn secondary" onClick={() => navigate(`/notary?sessionId=${encodeURIComponent(row.sessionId)}&role=notary`)}>
          Open Session
        </button>
      );
    }

    return <span className="muted">-</span>;
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
                  <td>{renderActions(row, type)}</td>
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
                  <button className="notary-btn" onClick={reloadDocuments}>
                    Refresh
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

            {showScheduleModal ? (
              <div className="session-details-overlay" onClick={() => setShowScheduleModal(false)}>
                <div className="session-details-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="session-details-header">
                    <h3>Schedule Meeting</h3>
                  </div>
                  <div className="session-details-body">
                    <div className="form-grid">
                      <div className="form-row">
                        <label>Date</label>
                        <input type="date" value={selectedScheduleDate} onChange={(e) => setSelectedScheduleDate(e.target.value)} />
                      </div>
                      <div className="form-row">
                        <label>Time</label>
                        <input type="time" value={selectedScheduleTime} onChange={(e) => setSelectedScheduleTime(e.target.value)} />
                      </div>
                    </div>
                    <div className="inline-actions">
                      <button className="notary-btn secondary" onClick={() => setShowScheduleModal(false)}>
                        Cancel
                      </button>
                      <button className="notary-btn" disabled={saving} onClick={handleConfirmSchedule}>
                        Save Schedule
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

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
