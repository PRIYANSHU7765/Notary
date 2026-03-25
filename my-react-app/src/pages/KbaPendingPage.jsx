import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchKbaStatus, cancelKba } from '../utils/apiClient'
import './KbaFlow.css'

const AUTH_STORAGE_KEY = 'notary.authUser'

const getAuthUser = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

const setAuthKbaFields = (user = {}) => {
  const authUser = getAuthUser()
  if (!authUser) return
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      ...authUser,
      otpVerified: Boolean(user.otpVerified),
      kbaStatus: user.kbaStatus || authUser.kbaStatus || 'draft',
      kbaApprovedAt: user.kbaApprovedAt || null,
      kbaRejectedReason: user.kbaRejectedReason || null,
      phoneNumber: user.phoneNumber || authUser.phoneNumber || '',
    })
  )
}

const getDefaultRouteByRole = (role) => {
  if (role === 'owner') return '/owner/dashboard'
  if (role === 'notary') return '/notary/doc/dashboard'
  return '/'
}

const formatDate = (timestamp) => {
  if (!timestamp) return 'N/A'
  const date = new Date(Number(timestamp))
  if (Number.isNaN(date.getTime())) return 'N/A'
  return date.toLocaleString()
}

const KbaPendingPage = () => {
  const navigate = useNavigate()
  const authUser = getAuthUser() || {}
  const [statusData, setStatusData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [busyCancel, setBusyCancel] = useState(false)
  const [error, setError] = useState('')

  const refreshStatus = async () => {
    try {
      setBusy(true)
      setError('')
      const payload = await fetchKbaStatus()
      setStatusData(payload)
      setAuthKbaFields(payload.user)

      const status = String(payload?.user?.kbaStatus || '').toLowerCase()
      if (status === 'kba_approved') {
        navigate(getDefaultRouteByRole(authUser.role), { replace: true })
        return
      }
      if (status === 'kba_rejected') {
        navigate('/kba/rejected', { replace: true })
      }
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to fetch KBA status')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refreshStatus()
    const intervalId = window.setInterval(refreshStatus, 15000)
    return () => window.clearInterval(intervalId)
  }, [])

  return (
    <div className="kba-page">
      <div className="kba-card">
        <h1 className="kba-title">KBA Submitted, Review in Progress</h1>
        <p className="kba-subtitle">
          Your OTP is verified and your KBA document is under admin review. Dashboard access will be enabled once approved.
        </p>
        <div className="kba-status-pill">Current Status: kba pending review</div>

        {error && <div className="kba-message error">{error}</div>}

        <div className="kba-section">
          <h2>Submission Details</h2>
          <p>Document type: {statusData?.submission?.documentType || 'N/A'}</p>
          <p>Front file: {statusData?.submission?.fileNameFront || 'N/A'}</p>
          <p>Back file: {statusData?.submission?.fileNameBack || 'N/A'}</p>
          <p>Submitted at: {formatDate(statusData?.submission?.submittedAt)}</p>
          <p>Last status update: {formatDate(statusData?.user?.kbaUpdatedAt)}</p>
        </div>

        <div className="kba-actions">
          <button className="kba-btn primary" onClick={refreshStatus} disabled={busy}>
            {busy ? 'Checking...' : 'Check Status'}
          </button>
          <button
            className="kba-btn secondary"
            onClick={async () => {
              setError('')
              setBusyCancel(true)
              try {
                await cancelKba()
                navigate('/kba/verify')
              } catch (cancelError) {
                setError(cancelError?.message || 'Failed to cancel KBA')
              } finally {
                setBusyCancel(false)
              }
            }}
            disabled={busy || busyCancel}
          >
            {busyCancel ? 'Cancelling...' : 'Cancel KBA'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default KbaPendingPage
