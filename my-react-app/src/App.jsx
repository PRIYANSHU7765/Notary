import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'
import OwnerPage from './pages/OwnerPage'
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
  if (role === 'owner') return '/owner'
  if (role === 'notary') return '/notary'
  if (role === 'admin') return '/admin'
  return '/home'
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

  if (!isUserAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />
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
            <RequireAuth>
              <Navigate to={defaultRoute} replace />
            </RequireAuth>
          }
        />
        <Route
          path="/home"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/owner"
          element={
            <RequireAuth>
              <OwnerPage />
            </RequireAuth>
          }
        />
        <Route
          path="/notary"
          element={
            <RequireAuth>
              <NotaryPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to={authenticated ? '/' : '/login'} replace />} />
      </Routes>
    </div>
  )
}

export default App
