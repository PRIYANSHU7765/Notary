import React, { useEffect, useState } from 'react';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import './NotaryWorkspacePages.css';

const STORAGE_KEY = 'notary.settings';

const defaultSettings = {
  displayName: '',
  email: '',
  timezone: 'America/New_York',
  availability: 'weekday',
  emailNotifications: true,
  smsNotifications: true,
};

const NotarySettingsPage = () => {
  const [settings, setSettings] = useState(defaultSettings);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const authUser = (() => {
      try {
        return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {};
      } catch {
        return {};
      }
    })();

    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};
    } catch {
      stored = {};
    }

    setSettings({
      ...defaultSettings,
      displayName: authUser.username || '',
      email: authUser.email || '',
      ...stored,
    });
  }, []);

  const setField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setNotice('Settings saved.');
    window.setTimeout(() => setNotice(''), 2200);
  };

  return (
    <NotaryWorkspaceShell title="Settings" subtitle="Configure your account and notification preferences">
      <section className="notary-card">
        <div className="notary-card-body">
          <div className="form-grid">
            <div className="form-row">
              <label>Display Name</label>
              <input value={settings.displayName} onChange={(e) => setField('displayName', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input value={settings.email} onChange={(e) => setField('email', e.target.value)} />
            </div>
            <div className="form-row">
              <label>Timezone</label>
              <select value={settings.timezone} onChange={(e) => setField('timezone', e.target.value)}>
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
              </select>
            </div>
            <div className="form-row">
              <label>Availability</label>
              <select value={settings.availability} onChange={(e) => setField('availability', e.target.value)}>
                <option value="weekday">Weekday Business Hours</option>
                <option value="extended">Extended Hours</option>
                <option value="weekend">Weekend Focus</option>
              </select>
            </div>
            <div className="form-row">
              <label>Email Notifications</label>
              <select
                value={settings.emailNotifications ? 'yes' : 'no'}
                onChange={(e) => setField('emailNotifications', e.target.value === 'yes')}
              >
                <option value="yes">Enabled</option>
                <option value="no">Disabled</option>
              </select>
            </div>
            <div className="form-row">
              <label>SMS Notifications</label>
              <select
                value={settings.smsNotifications ? 'yes' : 'no'}
                onChange={(e) => setField('smsNotifications', e.target.value === 'yes')}
              >
                <option value="yes">Enabled</option>
                <option value="no">Disabled</option>
              </select>
            </div>
          </div>

          <div className="inline-actions">
            <button className="notary-btn" onClick={saveSettings}>Save Settings</button>
          </div>

          {notice ? <p className="muted">{notice}</p> : null}
        </div>
      </section>
    </NotaryWorkspaceShell>
  );
};

export default NotarySettingsPage;
