import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchKbaStatus } from '../utils/apiClient'
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
  if (role === 'owner') return '/owner/doc/dashboard'
  if (role === 'notary') return '/notary/meetings'
  return '/'
}

const KbaRejectedPage = () => {
  const navigate = useNavigate()
  const authUser = getAuthUser() || {}
  const [reason, setReason] = useState('KBA documents could not be verified')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refreshStatus = async () => {
    try {
      setBusy(true)
      setError('')
      const payload = await fetchKbaStatus()
      setAuthKbaFields(payload.user)

      const status = String(payload?.user?.kbaStatus || '').toLowerCase()
      if (status === 'kba_approved') {
        navigate(getDefaultRouteByRole(authUser.role), { replace: true })
        return
      }
      if (status === 'kba_pending_review') {
        navigate('/kba/pending', { replace: true })
        return
      }

      setReason(payload?.user?.kbaRejectedReason || payload?.submission?.rejectionReason || 'KBA documents could not be verified')
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to fetch KBA status')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  return (
    <div className="kba-page">
      <div className="kba-card">
        <h1 className="kba-title">KBA Verification Rejected</h1>
        <p className="kba-subtitle">
          Your previous KBA submission was rejected. Update your details and upload a clearer valid document.
        </p>
        <div className="kba-status-pill">Current Status: kba rejected</div>

        {error && <div className="kba-message error">{error}</div>}

        <div className="kba-section">
          <h2>Rejection Reason</h2>
          <p>{reason}</p>
        </div>

        <div className="kba-actions">
          <button className="kba-btn primary" onClick={() => navigate('/kba/verify')}>
            Re-submit KBA
          </button>
          <button className="kba-btn secondary" onClick={refreshStatus} disabled={busy}>
            {busy ? 'Checking...' : 'Refresh Status'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default KbaRejectedPage
