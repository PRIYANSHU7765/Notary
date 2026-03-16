import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { registerUser } from '../utils/apiClient'
import './RegisterPage.css'

const RegisterPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [role, setRole] = useState('owner')
  const [error, setError] = useState('')

  const moveToLogin = () => {
    navigate('/login', {
      state: {
        from: location.state?.from,
        registeredMessage: 'Registration successful. Please login with your credentials.'
      }
    })
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    setError('')

    const normalizedUsername = username.trim()
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedUsername || !normalizedEmail || !password || !newPassword) {
      setError('Please fill all required fields.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Please enter a valid email address.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }

    if (password !== newPassword) {
      setError('Password and New Password must match.')
      return
    }

    try {
      await registerUser({
        username: normalizedUsername,
        email: normalizedEmail,
        password,
        newPassword,
        role,
      })
      moveToLogin()
    } catch (registerError) {
      setError(registerError.message || 'Registration failed. Please try again.')
    }
  }

  return (
    <div className="register-page">
      <div className="register-card">
        <h1 className="register-title">Create Your Account</h1>
        <p className="register-subtitle">Register to access the Digital Notarization Platform.</p>

        <form className="register-form" onSubmit={handleRegister}>
          <label htmlFor="register-username" className="register-label">
            Username
          </label>
          <input
            id="register-username"
            type="text"
            className="register-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter username"
            autoComplete="username"
          />

          <label htmlFor="register-email" className="register-label">
            Email
          </label>
          <input
            id="register-email"
            type="email"
            className="register-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter email"
            autoComplete="email"
          />

          <label htmlFor="register-password" className="register-label">
            Password
          </label>
          <input
            id="register-password"
            type="password"
            className="register-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            autoComplete="new-password"
          />

          <label htmlFor="register-new-password" className="register-label">
            New Password
          </label>
          <input
            id="register-new-password"
            type="password"
            className="register-input"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
          />

          <label htmlFor="register-role" className="register-label">
            Role
          </label>
          <select
            id="register-role"
            className="register-input"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="owner">Doc owner</option>
            <option value="notary">Notary</option>
          </select>

          {error && <p className="register-message register-error">{error}</p>}

          <button type="submit" className="register-button">
            Register
          </button>
        </form>

        <p className="register-switch">
          Already have an account?{' '}
          <button type="button" className="register-switch-link" onClick={moveToLogin}>
            Back to Login
          </button>
        </p>
      </div>
    </div>
  )
}

export default RegisterPage
