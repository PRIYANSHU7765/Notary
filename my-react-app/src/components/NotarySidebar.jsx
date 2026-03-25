import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './NotarySidebar.css';

const NotarySidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const authUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('notary.authUser') || 'null');
    } catch {
      return null;
    }
  })();

  const menuItems = [
    { id: 'home', label: 'Home', path: '/notary/dashboard' },
    { id: 'transactions', label: 'Transactions', path: '/notary/transactions' },
    { id: 'witness', label: 'Witness', path: '/notary/witness' },
    { id: 'meetings', label: 'Meetings', path: '/notary/meetings' },
    { id: 'settings', label: 'Settings', path: '/notary/settings' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('notary.authUser');
    navigate('/login', { replace: true });
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="notary-sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <span className="brand-text">Notarize Pro</span>
        </div>
      </div>

      {/* User Profile */}
      {authUser && (
        <div className="sidebar-profile">
          <div className="profile-avatar">{authUser.username?.charAt(0).toUpperCase()}</div>
          <div className="profile-info">
            <p className="profile-name">{authUser.username}</p>
            <p className="profile-role">Notary</p>
          </div>
        </div>
      )}

      {/* Navigation Menu */}
      <nav className="sidebar-menu">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`menu-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
            title={item.label}
          >
            <span className="menu-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer Actions */}
      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout} title="Logout">
          Logout
        </button>
      </div>
    </div>
  );
};

export default NotarySidebar;
