import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { loginUser } from '../utils/apiClient'
import './AuthPage.css'

const AUTH_STORAGE_KEY = 'notary.authUser'
const AUTH_SESSION_TTL_MS = 8 * 60 * 60 * 1000

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

  const handleLogin = async (event) => {
    event.preventDefault()
    clearMessages()
    setSuccess('')

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.')
      return
    }

    try {
      const result = await loginUser({
        username: username.trim(),
        password,
      })

      localStorage.removeItem('notary.role')
      localStorage.removeItem('notary.ownerSessionId')
      localStorage.removeItem('notary.lastSessionId')
      
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          username: result.user.username,
          email: result.user.email,
          role: result.user.role,
          token: result.token,
          loggedInAt: Date.now(),
          expiresAt: Date.now() + AUTH_SESSION_TTL_MS,
        })
      )
      navigate(redirectPath, { replace: true })
    } catch (loginError) {
      setError(loginError.message || 'Invalid username or password. Please try again.')
    }
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
