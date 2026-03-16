import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import OwnerPage from './pages/OwnerPage'
import OwnerDashboardPage from './pages/OwnerDashboardPage'
import OwnerSessionPage from './pages/OwnerSessionPage'
import NotaryPage from './pages/NotaryPage'
import AdminPage from './pages/AdminPage'
import AuthPage from './pages/AuthPage'
import RegisterPage from './pages/RegisterPage'
import './App.css'

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
  if (role === 'notary') return '/notary'
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
  const authUser = getAuthUser()
  const defaultRoute = getDefaultRouteByRole(authUser?.role)

  return (
    <div className="app">
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
          path="/"
          element={
            authenticated && defaultRoute ? (
              <Navigate to={defaultRoute} replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
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
    </div>
  )
}

export default App
