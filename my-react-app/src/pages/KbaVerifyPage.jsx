import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchKbaStatus, sendKbaOtp, uploadKbaDocument, verifyKbaOtp } from '../utils/apiClient'
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
  if (role === 'notary') return '/notary/doc/dashboard'
  return '/'
}

const KbaVerifyPage = () => {
  const navigate = useNavigate()
  const authUser = getAuthUser() || {}
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusData, setStatusData] = useState(null)
  const [otpDestination, setOtpDestination] = useState(authUser.email || '')
  const [otpChannel, setOtpChannel] = useState('email')
  const [otpCode, setOtpCode] = useState('')
  const [documentType, setDocumentType] = useState('aadhaar')
  const [selectedFrontFile, setSelectedFrontFile] = useState(null)
  const [selectedBackFile, setSelectedBackFile] = useState(null)
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const currentKbaStatus = useMemo(() => {
    return statusData?.user?.kbaStatus || authUser.kbaStatus || 'draft'
  }, [statusData, authUser.kbaStatus])

  const isOtpAlreadyVerified = useMemo(() => {
    const lower = String(currentKbaStatus || '').toLowerCase();
    return lower === 'otp_verified' || lower === 'kba_approved';
  }, [currentKbaStatus])

  const isOtpPending = useMemo(() => {
    return String(currentKbaStatus || '').toLowerCase() === 'otp_pending';
  }, [currentKbaStatus])


  const refreshStatus = async () => {
    setStatusLoading(true)
    setError('')

    try {
      const payload = await fetchKbaStatus()
      setStatusData(payload)
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
      if (status === 'kba_rejected') {
        navigate('/kba/rejected', { replace: true })
      }
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to load KBA status')
    } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())

  const handleSendOtp = async () => {
    setError('')
    setSuccess('')
    if (!otpDestination.trim()) {
      setError('Email is required to send OTP')
      return
    }
    if (!isValidEmail(otpDestination)) {
      setError('Enter a valid email address')
      return
    }

    try {
      setBusyAction('send-otp')
      const payload = await sendKbaOtp(otpDestination.trim(), otpChannel)
      setSuccess(`OTP sent successfully to ${payload.destination}`)
      await refreshStatus()
    } catch (sendError) {
      setError(sendError.message || 'Failed to send OTP')
    } finally {
      setBusyAction('')
    }
  }

  const handleVerifyOtp = async () => {
    setError('')
    setSuccess('')

    if (!otpCode.trim()) {
      setError('Enter OTP code')
      return
    }

    try {
      setBusyAction('verify-otp')
      await verifyKbaOtp(otpCode.trim())
      setSuccess('OTP verified successfully')
      setOtpCode('')
      await refreshStatus()
    } catch (verifyError) {
      setError(verifyError.message || 'Failed to verify OTP')
    } finally {
      setBusyAction('')
    }
  }

  const convertFileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handleUploadKba = async () => {
    setError('')
    setSuccess('')

    if (!selectedFrontFile) {
      setError('Please select the front side of your document')
      return
    }
    if (!selectedBackFile) {
      setError('Please select the back side of your document')
      return
    }

    try {
      setBusyAction('upload-kba')
      
      console.log('[KBA Upload] Converting front file to data URL...')
      const documentDataUrlFront = await convertFileToDataUrl(selectedFrontFile)
      console.log('[KBA Upload] Front file converted, length:', documentDataUrlFront.length)
      
      console.log('[KBA Upload] Converting back file to data URL...')
      const documentDataUrlBack = await convertFileToDataUrl(selectedBackFile)
      console.log('[KBA Upload] Back file converted, length:', documentDataUrlBack.length)

      const payload = {
        documentType,
        front: {
          fileName: selectedFrontFile.name,
          mimeType: selectedFrontFile.type || 'application/octet-stream',
          documentDataUrl: documentDataUrlFront,
        },
        back: {
          fileName: selectedBackFile.name,
          mimeType: selectedBackFile.type || 'application/octet-stream',
          documentDataUrl: documentDataUrlBack,
        },
      }
      
      console.log('[KBA Upload] Sending payload with front:', payload.front.fileName, 'back:', payload.back.fileName)
      await uploadKbaDocument(payload)
      setSuccess('KBA documents submitted successfully. Waiting for admin review.')
      navigate('/kba/pending', { replace: true })
    } catch (uploadError) {
      console.error('[KBA Upload] Error:', uploadError)
      setError(uploadError.message || 'Failed to upload KBA documents')
    } finally {
      setBusyAction('')
    }
  }

  return (
    <div className="kba-page">
      <div className="kba-card">
        <h1 className="kba-title">Complete Your KBA Verification</h1>
        <p className="kba-subtitle">
          To use owner and notary dashboards, complete OTP verification and submit your identity document for KBA approval.
        </p>
        <div className="kba-status-pill">Current Status: {currentKbaStatus.replace(/_/g, ' ')}</div>

        {error && <div className="kba-message error">{error}</div>}
        {success && <div className="kba-message success">{success}</div>}

        <div className="kba-section">
          <h2>Step 1: Send OTP</h2>
          <p>Send a verification code to your email address.</p>
          <div className="kba-form-grid">
            <input
              className="kba-input"
              value={otpDestination}
              onChange={(event) => {
                setOtpDestination(event.target.value)
              }}
              placeholder="email@example.com"
            />
            <input className="kba-input" value="Email OTP" readOnly />
          </div>
          <div className="kba-actions">
            <button
              className="kba-btn primary"
              disabled={busyAction === 'send-otp' || isOtpAlreadyVerified}
              onClick={handleSendOtp}
            >
              {busyAction === 'send-otp' ? 'Sending OTP...' : isOtpAlreadyVerified ? 'OTP locked' : 'Send OTP'}
            </button>
            <button className="kba-btn ghost" onClick={refreshStatus} disabled={statusLoading}>
              Refresh Status
            </button>
          </div>
        </div>

        <div className="kba-section">
          <h2>Step 2: Verify OTP</h2>
          <p>Enter the OTP sent to your selected destination.</p>
          <div className="kba-form-grid">
            <input
              className="kba-input"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
              placeholder="Enter 6-digit OTP"
            />
          </div>
          <div className="kba-actions">
            <button
              className="kba-btn primary"
              disabled={busyAction === 'verify-otp' || isOtpAlreadyVerified || !isOtpPending}
              onClick={handleVerifyOtp}
            >
              {busyAction === 'verify-otp' ? 'Verifying...' : isOtpAlreadyVerified ? 'Already verified' : 'Verify OTP'}
            </button>
          </div>
        </div>

        <div className="kba-section">
          <h2>Step 3: Upload KBA Document</h2>
          <p>Upload both front and back sides of your ID document for admin approval.</p>
          <div className="kba-form-grid">
            <select
              className="kba-select"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
            >
              <option value="aadhaar">Aadhaar Card</option>
              <option value="pan">PAN Card</option>
              <option value="passport">Passport</option>
              <option value="driving_license">Driving License</option>
              <option value="voter_id">Voter ID</option>
            </select>
          </div>

          <div className="kba-form-grid" style={{ gap: '10px' }}>
            <label style={{ display: 'block' }}>
              Front side:
              <input
                className="kba-input"
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => setSelectedFrontFile(event.target.files?.[0] || null)}
              />
            </label>
            <label style={{ display: 'block' }}>
              Back side:
              <input
                className="kba-input"
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => setSelectedBackFile(event.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="kba-actions">
            <button className="kba-btn primary" disabled={busyAction === 'upload-kba'} onClick={handleUploadKba}>
              {busyAction === 'upload-kba' ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>

          {selectedFrontFile && <div className="kba-meta">Selected front: {selectedFrontFile.name}</div>}
          {selectedBackFile && <div className="kba-meta">Selected back: {selectedBackFile.name}</div>}
        </div>

        <div className="kba-highlight">
          Your dashboard access will be enabled only after KBA approval by admin.
        </div>
      </div>
    </div>
  )
}

export default KbaVerifyPage
