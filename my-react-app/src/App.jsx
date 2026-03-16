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

const isUserAuthenticated = () => {
  try {
    const authUser = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null')
    return Boolean(authUser?.username)
  } catch {
    return false
  }
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

  return (
    <div className="app">
      <Routes>
        <Route
          path="/login"
          element={authenticated ? <Navigate to="/" replace /> : <AuthPage />}
        />
        <Route
          path="/register"
          element={authenticated ? <Navigate to="/" replace /> : <RegisterPage />}
        />
        <Route
          path="/"
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
