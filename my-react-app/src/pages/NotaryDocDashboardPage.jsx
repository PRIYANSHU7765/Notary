import React, { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchOwnerDocuments, updateOwnerDocumentReview, scheduleOwnerDocumentMeeting } from '../utils/apiClient'
import socket from '../socket/socket'

const formatDate = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getReviewBadgeStyle = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'accepted' || normalized === 'notarized') {
    return { background: '#d1fae5', color: '#065f46' }
  }
  if (normalized === 'rejected') {
    return { background: '#fee2e2', color: '#991b1b' }
  }
  if (normalized === 'session_started') {
    return { background: '#cfe2ff', color: '#0a4e9b' }
  }
  if (normalized === 'pending_review' || normalized === 'uploaded') {
    return { background: '#fff3cd', color: '#856404' }
  }
  return { background: '#e5e7eb', color: '#374151' }
}

const NotaryDocDashboardPage = () => {
  const navigate = useNavigate()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [adminTerminationByDoc, setAdminTerminationByDoc] = useState({})
  const [actionMenuDocId, setActionMenuDocId] = useState(null)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [schedulingDocId, setSchedulingDocId] = useState(null)
  const [selectedScheduleDate, setSelectedScheduleDate] = useState('')
  const [selectedScheduleTime, setSelectedScheduleTime] = useState('')

  const authUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {}
    } catch {
      return {}
    }
  })()

  const getWorkflowStatus = (doc) => {
    const rawStatus = String(doc?.status || '').trim().toLowerCase()
    const review = String(doc?.notaryReview || '').trim().toLowerCase()

    if (rawStatus === 'notarized') return 'notarized'
    if (rawStatus === 'session_started') return 'session_started'
    if (rawStatus === 'accepted' || review === 'accepted') return 'accepted'
    if (rawStatus === 'rejected' || review === 'rejected') return 'rejected'
    if (rawStatus === 'uploaded' || rawStatus === 'pending_review' || review === 'pending') return 'pending_review'

    return rawStatus || 'pending_review'
  }

  const handleStartSession = (doc) => {
    if (!doc.sessionId) {
      console.error('❌ Document has no sessionId!', doc);
      alert('Error: Session ID not available. Please try again.');
      return;
    }

    if (adminTerminationByDoc[doc.id]) {
      alert('This session has been terminated by an administrator and cannot be restarted.');
      return;
    }

    console.log('📤 Notary Starting Session:', { documentId: doc.id, sessionId: doc.sessionId });
    
    // Navigate with a flag to indicate this is a fresh session start
    // The NotaryPage will emit 'notarySessionStarted' once it's loaded and connected
    navigate(`/notary?sessionId=${encodeURIComponent(doc.sessionId)}&role=notary&sessionStarted=true&documentId=${encodeURIComponent(doc.id)}`);
  };

  const handleScheduleMeeting = (doc) => {
    console.log('📅 Schedule meeting for document:', doc)
    setSchedulingDocId(doc.id)
    setShowScheduleModal(true)
    setActionMenuDocId(null)
  };

  const handleConfirmSchedule = async () => {
    if (!selectedScheduleDate || !selectedScheduleTime) {
      alert('Please select both date and time')
      return
    }

    try {
      const scheduledAt = new Date(`${selectedScheduleDate}T${selectedScheduleTime}`).toISOString()
      console.log('📅 Confirming schedule:', schedulingDocId, scheduledAt)
      
      await scheduleOwnerDocumentMeeting(schedulingDocId, scheduledAt)
      
      // Update local state to reflect the scheduled time
      setDocs((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === schedulingDocId
            ? { ...doc, scheduledAt }
            : doc
        )
      )
      
      setShowScheduleModal(false)
      setSchedulingDocId(null)
      setSelectedScheduleDate('')
      setSelectedScheduleTime('')
      alert('Meeting scheduled successfully!')
    } catch (error) {
      console.error('Failed to schedule meeting:', error)
      alert('Failed to schedule meeting. Please try again.')
    }
  };

  // Load documents from backend on component mount
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        setLoading(true)
        // Load documents that are not yet fully notarized (including uploaded/pending/accepted/session-started)
        const documents = await fetchOwnerDocuments({ notarized: false })
        setDocs(documents)
      } catch (error) {
        console.error('Failed to load documents:', error)
        setDocs([])
      } finally {
        setLoading(false)
      }
    }

    loadDocuments()

    // Listen for new notarized documents via socket.io
    const onDocumentNotarized = (newDocument) => {
      console.log('[notary-dashboard] Document notarized via socket:', newDocument)
      setDocs((prevDocs) => {
        if (newDocument?.status === 'notarized' || newDocument?.notarized) {
          return prevDocs.filter((d) => d.id !== newDocument.id)
        }

        // Check if document already exists
        const exists = prevDocs.some((d) => d.id === newDocument.id)
        if (exists) {
          // Update existing document
          return prevDocs.map((d) => (d.id === newDocument.id ? { ...d, ...newDocument } : d))
        }
        // Add new document
        return [newDocument, ...prevDocs]
      })
    }

    // Listen for cancelled notarizations
    const onDocumentNotarizationCancelled = (data) => {
      console.log('[notary-dashboard] Notarization cancelled via socket:', data.documentId)
      setDocs((prevDocs) => prevDocs.filter((d) => d.id !== data.documentId))
    }

    const onDocumentReviewUpdated = (updated) => {
      const documentId = updated?.documentId || updated?.id
      if (!documentId) return

      // Close action menu if doc status changed away from accepted (e.g., time expired and auto-started)
      if (actionMenuDocId === documentId && String(updated.status || '').trim().toLowerCase() !== 'accepted') {
        setActionMenuDocId(null)
      }

      setDocs((prevDocs) => {
        const exists = prevDocs.some((d) => d.id === documentId)
        if (!exists) return prevDocs

        return prevDocs.map((d) =>
          d.id === documentId
            ? {
                ...d,
                notaryReview: updated.notaryReview || d.notaryReview,
                notaryName: updated.notaryName || d.notaryName,
                notaryReviewedAt: updated.notaryReviewedAt || d.notaryReviewedAt,
                scheduledAt: updated.scheduledAt || d.scheduledAt,
                status: updated.status || d.status,
              }
            : d
        )
      })
    }

    const onDocumentDeleted = (payload) => {
      const documentId = payload?.documentId || payload?.id
      if (!documentId) return
      setDocs((prevDocs) => prevDocs.filter((d) => d.id !== documentId))
    }

    const onAdminSessionTerminated = (payload) => {
      const documentId = payload?.documentId
      if (!documentId) return

      setAdminTerminationByDoc((prev) => ({
        ...prev,
        [documentId]: payload?.message || 'Admin terminated this session.',
      }))

      setDocs((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === documentId
            ? {
                ...doc,
                status: doc.status === 'notarized' ? 'notarized' : 'accepted',
                notaryReview: doc.notaryReview === 'rejected' ? 'accepted' : (doc.notaryReview || 'accepted'),
              }
            : doc
        )
      )
    }

    socket.on('documentNotarized', onDocumentNotarized)
    socket.on('documentNotarizationCancelled', onDocumentNotarizationCancelled)
    socket.on('documentReviewUpdated', onDocumentReviewUpdated)
    socket.on('documentDeleted', onDocumentDeleted)
    socket.on('adminSessionTerminated', onAdminSessionTerminated)

    return () => {
      socket.off('documentNotarized', onDocumentNotarized)
      socket.off('documentNotarizationCancelled', onDocumentNotarizationCancelled)
      socket.off('documentReviewUpdated', onDocumentReviewUpdated)
      socket.off('documentDeleted', onDocumentDeleted)
      socket.off('adminSessionTerminated', onAdminSessionTerminated)
    }
  }, [])

  const notarizedDocs = useMemo(
    () => docs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)),
    [docs]
  )

  const handleDecision = async (docId, decision) => {
    const authUser = (() => {
      try {
        return JSON.parse(localStorage.getItem('notary.authUser') || 'null')
      } catch {
        return null
      }
    })()

    const notaryName = authUser?.username || 'Notary'

    // Optimistic update
    const nextStatus = decision === 'accepted' ? 'accepted' : decision === 'rejected' ? 'rejected' : 'pending_review'

    const updatedDocs = docs.map((doc) => {
      if (doc.id !== docId) return doc

      return {
        ...doc,
        notaryReview: decision,
        status: nextStatus,
        notaryReviewedAt: new Date().toISOString(),
        notaryName,
      }
    })
    setDocs(updatedDocs)

    // Call backend API
    try {
      await updateOwnerDocumentReview(docId, decision, notaryName)
    } catch (error) {
      console.error('Failed to update document review:', error)
      // Revert on error
      setDocs(docs)
    }
  }

  const ownerUsers = useMemo(() => {
    const ownerMap = new Map();
    docs.forEach((doc) => {
      if (doc.ownerId) {
        ownerMap.set(doc.ownerId, { ownerId: doc.ownerId, ownerName: doc.ownerName });
      }
    });
    return Array.from(ownerMap.values());
  }, [docs]);

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fb', padding: '36px 20px', fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: '1600px', width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '30px', fontWeight: 700 }}>Notary Document Dashboard</h1>
          <button
            onClick={() => navigate('/notary/dashboard')}
            style={{
              border: '1px solid #1d4ed8',
              background: '#1d4ed8',
              color: '#fff',
              borderRadius: '8px',
              padding: '8px 14px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
            }}
          >
            Back to Dashboard
          </button>
        </div>
        <p style={{ margin: '8px 0 16px 0', color: '#475569' }}>
          Review documents marked for notarization by owners.
        </p>
        <div style={{ marginBottom: '24px', padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ minWidth: '220px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              You
            </div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: '#1f2937' }}>
              <div style={{ fontWeight: 600 }}>{authUser?.username || 'Notary'}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                {authUser?.role ? authUser.role.toUpperCase() : 'NOTARY'} • ID: {authUser?.userId || '—'}
              </div>
            </div>
          </div>
          <div style={{ minWidth: '220px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Owners in queue
            </div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: '#1f2937' }}>
              {ownerUsers.length === 0 ? (
                <span style={{ color: '#64748b' }}>No owners yet</span>
              ) : (
                <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
                  {ownerUsers.slice(0, 3).map((o) => (
                    <li key={o.ownerId} style={{ marginBottom: '4px' }}>
                      {o.ownerName || 'Unknown'}
                    </li>
                  ))}
                  {ownerUsers.length > 3 && (
                    <li style={{ color: '#64748b' }}>+ {ownerUsers.length - 3} more</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2.4fr 1.1fr 1.2fr 1fr 1.2fr 1.25fr 1.25fr',
              gap: '12px',
              padding: '14px 18px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              fontWeight: 700,
              fontSize: '13px',
              color: '#334155',
              alignItems: 'center',
            }}
          >
            <span>Document</span>
            <span>Owner Name</span>
            <span>Uploaded</span>
            <span>Status</span>
            <span>Session</span>
            <span>Scheduled</span>
            <span>Actions</span>
          </div>

          {notarizedDocs.length === 0 ? (
            <div style={{ padding: '28px 18px', color: '#64748b' }}>
              No owner-notarized documents available yet.
            </div>
          ) : (
            notarizedDocs.map((doc, idx) => {
              const status = getWorkflowStatus(doc)
              const badgeStyle = getReviewBadgeStyle(status)
              const reviewStatus = status

              return (
                <div
                  key={doc.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.2fr 1.4fr 1fr 1.2fr 1.4fr 1.5fr',
                    gap: '12px',
                    padding: '14px 18px',
                    alignItems: 'center',
                    borderBottom: idx === notarizedDocs.length - 1 ? 'none' : '1px solid #f1f5f9',
                  }}
                >
                  <span style={{ color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name || 'Untitled Document'}</span>
                  <span style={{ color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.ownerName || 'Unknown Owner'}</span>
                  <span style={{ color: '#475569', whiteSpace: 'nowrap' }}>{formatDate(doc.uploadedAt)}</span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 'fit-content',
                      textTransform: 'capitalize',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 700,
                      ...badgeStyle,
                    }}
                  >
                    {reviewStatus}
                  </span>
                  {adminTerminationByDoc[doc.id] ? (
                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#be123c', fontWeight: 600 }}>
                      {adminTerminationByDoc[doc.id]}
                    </div>
                  ) : null}
                  
                  <span style={{ color: '#475569', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.sessionId ? doc.sessionId.substring(0, 26) + '...' : '-'}
                  </span>

                  <span style={{ color: doc.scheduledAt ? '#059669' : '#64748b', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.scheduledAt ? `📅 ${new Date(doc.scheduledAt).toLocaleDateString()} ${new Date(doc.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—'}
                  </span>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative' }}>
                    {(status === 'accepted' || status === 'session_started') ? (
                      <button
                        onClick={() => handleStartSession(doc)}
                        disabled={Boolean(adminTerminationByDoc[doc.id])}
                        style={{
                          border: 'none',
                          borderRadius: '8px',
                          background: '#2563eb',
                          color: '#ffffff',
                          fontWeight: 600,
                          padding: '8px 12px',
                          cursor: adminTerminationByDoc[doc.id] ? 'not-allowed' : 'pointer',
                          opacity: adminTerminationByDoc[doc.id] ? 0.6 : 1,
                          fontSize: '12px',
                        }}
                        title="Start a session with this document"
                      >
                        Start Session
                      </button>
                    ) : null}
                    {status !== 'accepted' && status !== 'session_started' ? (
                      <button
                        onClick={() => handleDecision(doc.id, 'accepted')}
                        style={{
                          border: 'none',
                          borderRadius: '8px',
                          background: '#16a34a',
                          color: '#ffffff',
                          fontWeight: 600,
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Accept
                      </button>
                    ) : null}
                    {status !== 'rejected' && status !== 'session_started' ? (
                      <button
                        onClick={() => handleDecision(doc.id, 'rejected')}
                        style={{
                          border: 'none',
                          borderRadius: '8px',
                          background: '#dc2626',
                          color: '#ffffff',
                          fontWeight: 600,
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Reject
                      </button>
                    ) : null}

                    {status === 'accepted' ? (
                      <>
                        <button
                          onClick={() => setActionMenuDocId(actionMenuDocId === doc.id ? null : doc.id)}
                          style={{
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            background: '#f8fafc',
                            color: '#334155',
                            fontWeight: 700,
                            padding: '8px 10px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title="More actions"
                        >
                          ⋮
                        </button>

                        {actionMenuDocId === doc.id ? (
                          <div
                            style={{
                              position: 'absolute',
                              top: '42px',
                              right: '0px',
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
                              borderRadius: '8px',
                              zIndex: 20,
                              minWidth: '154px',
                              textAlign: 'left',
                            }}
                          >
                            <button
                              onClick={() => handleScheduleMeeting(doc)}
                              style={{
                                width: '100%',
                                border: 'none',
                                background: 'transparent',
                                padding: '10px 12px',
                                textAlign: 'left',
                                color: '#111827',
                                cursor: 'pointer',
                                fontSize: '13px',
                              }}
                            >
                              Schedule Meeting
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Schedule Meeting Modal */}
      {showScheduleModal ? (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowScheduleModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px 0', color: '#0f172a', fontSize: '20px', fontWeight: 700 }}>
              📅 Schedule Meeting
            </h2>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                Date
              </label>
              <input
                type="date"
                value={selectedScheduleDate}
                onChange={(e) => setSelectedScheduleDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                Time
              </label>
              <input
                type="time"
                value={selectedScheduleTime}
                onChange={(e) => setSelectedScheduleTime(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowScheduleModal(false)}
                style={{
                  flex: 1,
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  color: '#334155',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSchedule}
                style={{
                  flex: 1,
                  border: 'none',
                  borderRadius: '8px',
                  background: '#3b82f6',
                  color: '#ffffff',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default NotaryDocDashboardPage