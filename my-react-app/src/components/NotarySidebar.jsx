import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './NotarySidebar.css';

const MENU_BY_ROLE = {
  notary: [
    { id: 'home', label: 'Home', path: '/notary/dashboard' },
    { id: 'transactions', label: 'Transactions', path: '/notary/transactions' },
    { id: 'tools', label: 'Tools', path: '/notary/tools' },
    { id: 'on-demand', label: 'On demand', path: '/notary/on-demand' },
    { id: 'meetings', label: 'Meetings', path: '/notary/meetings' },
    { id: 'settings', label: 'Settings', path: '/notary/settings' },
  ],
  owner: [
    { id: 'home', label: 'Home', path: '/owner/dashboard' },
    { id: 'transactions', label: 'Transactions', path: '/owner/transactions' },
    { id: 'meetings', label: 'Meetings', path: '/owner/meetings' },
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

  const resolvedRole = role === 'owner' ? 'owner' : 'notary';
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
          <span className="brand-text">{resolvedRole === 'owner' ? 'Owners' : 'Notaries'}</span>
        </div>
      </div>

      {authUser && (
        <div className="sidebar-profile">
          <div className="profile-avatar">{authUser.username?.charAt(0).toUpperCase()}</div>
          <div className="profile-info">
            <p className="profile-name">{authUser.username}</p>
            <p className="profile-role">{resolvedRole === 'owner' ? 'Owner' : 'Notary'}</p>
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
