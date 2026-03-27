import React, { Component } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import OwnerPage from './pages/OwnerPage'
import OwnerDashboardPage from './pages/OwnerDashboardPage'
import OwnerAssetsPage from './pages/OwnerAssetsPage'
import OwnerDocDashboardWrapper from './pages/OwnerDocDashboardWrapper'
import OwnerHomeDashboardPage from './pages/OwnerHomeDashboardPage'
import OwnerTransactionsPage from './pages/OwnerTransactionsPage'
import OwnerMeetingsPage from './pages/OwnerMeetingsPage'
import OwnerDocumentViewPage from './pages/OwnerDocumentViewPage'
import OwnerSessionPage from './pages/OwnerSessionPage'
import NotaryPage from './pages/NotaryPage'
import NotaryDashboardPage from './pages/NotaryDashboardPage'
import NotaryTransactionsPage from './pages/NotaryTransactionsPage'
import NotaryToolsPage from './pages/NotaryToolsPage'
import NotaryOnDemandPage from './pages/NotaryOnDemandPage'
import NotaryMeetingsPage from './pages/NotaryMeetingsPage'
import NotarySettingsPage from './pages/NotarySettingsPage'
import AdminPage from './pages/AdminPage'
import HomePage from './pages/HomePage'
import AuthPage from './pages/AuthPage'
import AdminLoginPage from './pages/AdminLoginPage'
import RegisterPage from './pages/RegisterPage'
import KbaVerifyPage from './pages/KbaVerifyPage'
import KbaPendingPage from './pages/KbaPendingPage'
import KbaRejectedPage from './pages/KbaRejectedPage'
import './App.css'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    this.setState({ error, info })
    console.error('📛 ErrorBoundary caught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, color: '#fff', background: '#1a1a1a', height: '100vh' }}>
          <h1 style={{ color: '#ff6b6b' }}>Something went wrong.</h1>
          <p style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</p>
          <details style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
            {this.state.info?.componentStack}
          </details>
        </div>
      )
    }
    return this.props.children
  }
}

const AUTH_STORAGE_KEY = 'notary.authUser'

const getAuthUser = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

const getDefaultRouteByRole = (role) => {
  if (role === 'signer') return '/signer/dashboard'
  if (role === 'notary') return '/notary/dashboard'
  if (role === 'admin') return '/admin'
  return null
}

const getKbaRedirectPath = (authUser) => {
  const role = authUser?.role
  if (!['signer', 'notary'].includes(role)) return null

  const status = String(authUser?.kbaStatus || 'draft').trim().toLowerCase()
  const otpVerified = Boolean(authUser?.otpVerified)

  if (status === 'kba_approved') return null
  if (status === 'kba_pending_review') return '/kba/pending'
  if (status === 'kba_rejected') return '/kba/rejected'
  if (!otpVerified) return '/kba/verify'
  return '/kba/verify'
}

const isUserAuthenticated = () => {
  const authUser = getAuthUser()
  const hasCoreFields = Boolean(authUser?.username && authUser?.token && authUser?.role)
  const hasValidExpiry =
    typeof authUser?.expiresAt === 'number' && authUser.expiresAt > Date.now()

  const isValid = hasCoreFields && hasValidExpiry

  if (!isValid && authUser) {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  return isValid
}

function RequireAuth({ children }) {
  const location = useLocation()
  const authUser = getAuthUser()

  if (!isUserAuthenticated() || !authUser) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}

function RequireRole({ children, allowedRoles = [] }) {
  const authUser = getAuthUser()

  if (!authUser) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(authUser.role)) {
    const fallback = getDefaultRouteByRole(authUser.role)
    return <Navigate to={fallback || '/'} replace />
  }

  return children
}

function RequireKbaApproval({ children }) {
  const authUser = getAuthUser()
  if (!authUser) {
    return <Navigate to="/login" replace />
  }

  const kbaRedirect = getKbaRedirectPath(authUser)
  if (kbaRedirect) {
    return <Navigate to={kbaRedirect} replace />
  }

  return children
}

function RequireKbaFlowAccess({ children }) {
  const authUser = getAuthUser()
  if (!authUser) {
    return <Navigate to="/login" replace />
  }

  if (!['signer', 'notary'].includes(authUser.role)) {
    const fallback = getDefaultRouteByRole(authUser.role)
    return <Navigate to={fallback || '/'} replace />
  }

  const kbaRedirect = getKbaRedirectPath(authUser)
  if (!kbaRedirect) {
    const fallback = getDefaultRouteByRole(authUser.role)
    return <Navigate to={fallback || '/'} replace />
  }

  return children
}

function App() {
  const authenticated = isUserAuthenticated()

  return (
    <div className="app">
      <ErrorBoundary>
        <Routes>
          <Route
            path="/login"
            element={<AuthPage />}
          />
          <Route
            path="/register"
            element={<RegisterPage />}
          />
          <Route
            path="/admin-login"
            element={<AdminLoginPage />}
          />
          <Route
            path="/kba/verify"
            element={
              <RequireAuth>
                <RequireKbaFlowAccess>
                  <KbaVerifyPage />
                </RequireKbaFlowAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/kba/pending"
            element={
              <RequireAuth>
                <RequireKbaFlowAccess>
                  <KbaPendingPage />
                </RequireKbaFlowAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/kba/rejected"
            element={
              <RequireAuth>
                <RequireKbaFlowAccess>
                  <KbaRejectedPage />
                </RequireKbaFlowAccess>
              </RequireAuth>
            }
          />
          <Route
            path="/"
            element={<HomePage />}
          />
          <Route
            path="/signer/dashboard"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['signer']}>
                  <RequireKbaApproval>
                    <OwnerHomeDashboardPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/signer/transactions"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['signer']}>
                  <RequireKbaApproval>
                    <OwnerTransactionsPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/signer/meetings"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['signer']}>
                  <RequireKbaApproval>
                    <OwnerMeetingsPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/signer/assets"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['signer']}>
                  <RequireKbaApproval>
                    <OwnerAssetsPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/signer/session"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['signer']}>
                  <RequireKbaApproval>
                    <OwnerSessionPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/signer/doc/dashboard"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['signer']}>
                  <RequireKbaApproval>
                    <OwnerDocDashboardWrapper />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/signer/doc/view/:docId"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['signer']}>
                  <RequireKbaApproval>
                    <OwnerDocumentViewPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/signer"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['signer']}>
                  <RequireKbaApproval>
                    <OwnerPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/notary/doc/dashboard"
            element={<Navigate to="/notary/meetings" replace />}
          />
          <Route
            path="/notary/dashboard"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['notary']}>
                  <RequireKbaApproval>
                    <NotaryDashboardPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/notary/transactions"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['notary']}>
                  <RequireKbaApproval>
                    <NotaryTransactionsPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/notary/witness"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={["notary"]}>
                  <RequireKbaApproval>
                    <NotaryOnDemandPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/notary/on-demand"
            element={<Navigate to="/notary/witness" replace />}
          />
          <Route
            path="/notary/meetings"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['notary']}>
                  <RequireKbaApproval>
                    <NotaryMeetingsPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/notary/settings"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['notary']}>
                  <RequireKbaApproval>
                    <NotarySettingsPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/notary"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['notary']}>
                  <RequireKbaApproval>
                    <NotaryPage />
                  </RequireKbaApproval>
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['admin']}>
                  <AdminPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to={authenticated ? '/' : '/login'} replace />} />
        </Routes>
      </ErrorBoundary>
    </div>
  )
}

export default App
