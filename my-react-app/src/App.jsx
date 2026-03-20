import React, { Component } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import OwnerPage from './pages/OwnerPage'
import OwnerDashboardPage from './pages/OwnerDashboardPage'
import OwnerDocumentViewPage from './pages/OwnerDocumentViewPage'
import OwnerSessionPage from './pages/OwnerSessionPage'
import NotaryPage from './pages/NotaryPage'
import NotaryDocDashboardPage from './pages/NotaryDocDashboardPage'
import AdminPage from './pages/AdminPage'
import HomePage from './pages/HomePage'
import AuthPage from './pages/AuthPage'
import AdminLoginPage from './pages/AdminLoginPage'
import RegisterPage from './pages/RegisterPage'
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
  if (role === 'owner') return '/owner/doc/dashboard'
  if (role === 'notary') return '/notary/doc/dashboard'
  if (role === 'admin') return '/admin'
  return null
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
            path="/"
            element={<HomePage />}
          />
          <Route
            path="/owner/session"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['owner']}>
                  <OwnerSessionPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/owner/doc/dashboard"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['owner']}>
                  <OwnerDashboardPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/owner/doc/view/:docId"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['owner']}>
                  <OwnerDocumentViewPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/owner"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['owner']}>
                  <OwnerPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/notary/doc/dashboard"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['notary']}>
                  <NotaryDocDashboardPage />
                </RequireRole>
              </RequireAuth>
            }
          />
          <Route
            path="/notary"
            element={
              <RequireAuth>
                <RequireRole allowedRoles={['notary']}>
                  <NotaryPage />
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
