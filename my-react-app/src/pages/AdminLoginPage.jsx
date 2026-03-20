import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginUser } from '../utils/apiClient'
import './AuthPage.css'

const AUTH_STORAGE_KEY = 'notary.authUser'
const AUTH_SESSION_TTL_MS = 8 * 60 * 60 * 1000

const AdminLoginPage = () => {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAdminLogin = async (event) => {
    event.preventDefault()
    setError('')

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.')
      return
    }

    setLoading(true)

    try {
      const result = await loginUser({ username: username.trim(), password })

      if (result?.user?.role !== 'admin') {
        setError('This account is not an admin account.')
        setLoading(false)
        return
      }

      localStorage.removeItem('notary.role')
      localStorage.removeItem('notary.ownerSessionId')
      localStorage.removeItem('notary.lastSessionId')

      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          userId: result.user.userId,
          username: result.user.username,
          email: result.user.email,
          role: result.user.role,
          token: result.token,
          loggedInAt: Date.now(),
          expiresAt: Date.now() + AUTH_SESSION_TTL_MS,
        })
      )

      navigate('/admin', { replace: true })
    } catch (loginError) {
      setError(loginError.message || 'Invalid admin credentials.')
    } finally {
      setLoading(false)
    }
  }

  const moveToUserLogin = () => {
    navigate('/login')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Admin Login</h1>
        <p className="auth-subtitle">Sign in with admin credentials to continue.</p>

        <form className="auth-form" onSubmit={handleAdminLogin}>
          <label htmlFor="admin-username" className="auth-label">
            Username
          </label>
          <input
            id="admin-username"
            type="text"
            className="auth-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter username"
            autoComplete="username"
          />

          <label htmlFor="admin-password" className="auth-label">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            className="auth-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            autoComplete="current-password"
          />

          {error && <p className="auth-message auth-error">{error}</p>}

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <p className="auth-switch">
          <button type="button" className="auth-switch-link" onClick={moveToUserLogin}>
            Back to User Login
          </button>
        </p>
      </div>
    </div>
  )
}

export default AdminLoginPage
