import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './AuthPage.css'

const USERS_STORAGE_KEY = 'notary.users'
const AUTH_STORAGE_KEY = 'notary.authUser'

const getRegisteredUsers = () => {
  try {
    const users = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || '[]')
    return Array.isArray(users) ? users : []
  } catch {
    return []
  }
}

const AuthPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(location.state?.registeredMessage || '')

  const redirectPath = useMemo(() => {
    const from = location.state?.from
    if (!from) return '/'
    const query = from.search || ''
    return `${from.pathname || '/'}${query}`
  }, [location.state])

  const clearMessages = () => {
    setError('')
  }

  const handleLogin = (event) => {
    event.preventDefault()
    clearMessages()

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.')
      return
    }

    const users = getRegisteredUsers()
    const matchedUser = users.find(
      (user) => user.username === username.trim() && user.password === password
    )

    if (!matchedUser) {
      setError('Invalid username or password. Please try again or register.')
      return
    }

    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ username: matchedUser.username, loggedInAt: Date.now() })
    )
    navigate(redirectPath, { replace: true })
  }

  const moveToRegister = () => {
    navigate('/register', { state: { from: location.state?.from } })
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Digital Notarization Platform</h1>
        <p className="auth-subtitle">Sign in to continue to the platform.</p>

        <form className="auth-form" onSubmit={handleLogin}>
          <label htmlFor="username" className="auth-label">
            Username
          </label>
          <input
            id="username"
            type="text"
            className="auth-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter username"
            autoComplete="username"
          />

          <label htmlFor="password" className="auth-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="auth-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            autoComplete="current-password"
          />

          {error && <p className="auth-message auth-error">{error}</p>}
          {success && <p className="auth-message auth-success">{success}</p>}

          <button type="submit" className="auth-button">Login</button>
        </form>

        <p className="auth-switch">
          New here?{' '}
          <button type="button" className="auth-switch-link" onClick={moveToRegister}>
            Register
          </button>
        </p>
      </div>
    </div>
  )
}

export default AuthPage
