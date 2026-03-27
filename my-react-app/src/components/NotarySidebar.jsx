import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './NotarySidebar.css';

const MENU_BY_ROLE = {
  notary: [
    { id: 'home', label: 'Home', path: '/notary/dashboard' },
    { id: 'transactions', label: 'Transactions', path: '/notary/transactions' },
    { id: 'assets', label: 'Assets', path: '/notary/assets' },
    { id: 'witness', label: 'Witness', path: '/notary/witness' },
    { id: 'meetings', label: 'Meetings', path: '/notary/meetings' },
    { id: 'settings', label: 'Settings', path: '/notary/settings' },
  ],
  signer: [
    { id: 'home', label: 'Home', path: '/signer/dashboard' },
    { id: 'transactions', label: 'Transactions', path: '/signer/transactions' },
    { id: 'meetings', label: 'Meetings', path: '/signer/meetings' },
    { id: 'assets', label: 'Assets', path: '/signer/assets' },
    { id: 'upload', label: 'Upload document', path: '/signer/doc/dashboard' },
  ],
};

const NotarySidebar = ({ role = 'notary', menuItems }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const authUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('notary.authUser') || 'null');
    } catch {
      return null;
    }
  })();

  const ownerSessionActive = localStorage.getItem('signer.sessionActive') === 'true';
  if (ownerSessionActive) {
    return null;
  }

  const resolvedRole = role === 'signer' ? 'signer' : 'notary';
  const resolvedMenuItems = Array.isArray(menuItems) && menuItems.length > 0
    ? menuItems
    : MENU_BY_ROLE[resolvedRole];

  const handleLogout = () => {
    localStorage.removeItem('notary.authUser');
    navigate('/login', { replace: true });
  };

  const isActive = (path) => location.pathname === path;

  return (
    <div className="notary-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <span className="brand-text">Notarize Pro</span>
        </div>
      </div>

      {authUser && (
        <div className="sidebar-profile">
          <div className="profile-info" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <p className="profile-name" style={{ fontWeight: 700 }}>{authUser.username}</p>
          </div>
        </div>
      )}

      <nav className="sidebar-menu">
        {resolvedMenuItems.map((item) => (
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

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout} title="Logout">
          Logout
        </button>
      </div>
    </div>
  );
};

export default NotarySidebar;
