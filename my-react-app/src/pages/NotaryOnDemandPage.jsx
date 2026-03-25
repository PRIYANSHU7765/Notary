import React, { useEffect, useMemo, useState } from 'react';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import './NotaryWorkspacePages.css';

const STORAGE_KEY = 'notary.witness.preferences';

const defaultPreferences = {
  location: '',
  preferredLanguage: 'English',
  witnessSessionMode: 'manual',
  autoAcceptWitnessSessions: false,
  requireRecording: true,
};

const NotaryOnDemandPage = () => {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored && typeof stored === 'object') {
        setPreferences((prev) => ({ ...prev, ...stored }));
      }
    } catch {
      // ignore invalid local settings
    }
  }, []);

  const actions = useMemo(
    () => (
      <button
        className="notary-btn"
        onClick={() => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
          setNotice('Witness preferences saved successfully.');
          window.setTimeout(() => setNotice(''), 2400);
        }}
      >
        Save Preferences
      </button>
    ),
    [preferences]
  );

  const setField = (field, value) => {
    setPreferences((prev) => ({ ...prev, [field]: value }));
  };

  const setCurrentLocation = () => {
    if (!navigator.geolocation) {
      setNotice('Geolocation is not supported in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const value = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
        setField('location', value);
      },
      () => {
        setNotice('Unable to get current location.');
      }
    );
  };

  return (
    <NotaryWorkspaceShell
      title="Witness"
      subtitle="Manage location, device preferences, witness sessions, and availability settings"
      actions={actions}
    >
      <div className="page-stack">
        <section className="notary-card">
          <div className="notary-card-header">Location and Witness Session Preferences</div>
          <div className="notary-card-body">
            <div className="form-grid">
              <div className="form-row">
                <label>Service Location</label>
                <input
                  value={preferences.location}
                  onChange={(e) => setField('location', e.target.value)}
                  placeholder="City, State or Coordinates"
                />
              </div>
              <div className="form-row">
                <label>Language</label>
                <select
                  value={preferences.preferredLanguage}
                  onChange={(e) => setField('preferredLanguage', e.target.value)}
                >
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                </select>
              </div>
              <div className="form-row">
                <label>Witness Session Handling</label>
                <select
                  value={preferences.witnessSessionMode}
                  onChange={(e) => setField('witnessSessionMode', e.target.value)}
                >
                  <option value="manual">Manual Approval</option>
                  <option value="priority">Priority Witness Sessions</option>
                  <option value="balanced">Balanced Queue</option>
                </select>
              </div>
              <div className="form-row">
                <label>Auto Accept Witness Sessions</label>
                <select
                  value={preferences.autoAcceptWitnessSessions ? 'yes' : 'no'}
                  onChange={(e) => setField('autoAcceptWitnessSessions', e.target.value === 'yes')}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              <div className="form-row">
                <label>Require Witness Session Recording</label>
                <select
                  value={preferences.requireRecording ? 'yes' : 'no'}
                  onChange={(e) => setField('requireRecording', e.target.value === 'yes')}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>

            <div className="inline-actions">
              <button className="notary-btn secondary" onClick={setCurrentLocation}>
                Use Current Location
              </button>
            </div>
          </div>
        </section>

        {notice ? <p className="muted">{notice}</p> : null}
      </div>
    </NotaryWorkspaceShell>
  );
};

export default NotaryOnDemandPage;
