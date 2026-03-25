import React, { useEffect, useMemo, useState } from 'react';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import { deleteAsset, fetchAssets, saveAsset } from '../utils/apiClient';
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

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const NotarySettingsPage = () => {
  const [settings, setSettings] = useState(defaultSettings);
  const [notice, setNotice] = useState('');

  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [templateNotes, setTemplateNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const authUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {};
    } catch {
      return {};
    }
  }, []);

  const userId = authUser.userId || authUser.id || authUser.username;

  const loadTemplates = async () => {
    try {
      setError('');
      const assets = await fetchAssets('notary', { userId });
      const templateAssets = (Array.isArray(assets) ? assets : []).filter((asset) => String(asset.type).toLowerCase() === 'template');
      setTemplates(templateAssets);
    } catch (err) {
      setError(err?.message || 'Unable to load templates');
      setTemplates([]);
    }
  };

  useEffect(() => {
    const authUserFromStorage = (() => {
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
      displayName: authUserFromStorage.username || '',
      email: authUserFromStorage.email || '',
      ...stored,
    });

    loadTemplates();
  }, []);

  const setField = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setNotice('Settings saved.');
    window.setTimeout(() => setNotice(''), 2200);
  };

  const handleUploadTemplate = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError('');
      const image = await toDataUrl(file);
      await saveAsset({
        id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        username: authUser.username,
        name: templateName.trim() || file.name,
        type: 'template',
        image,
        text: templateNotes.trim(),
        userRole: 'notary',
      });

      setTemplateName('');
      setTemplateNotes('');
      await loadTemplates();
    } catch (err) {
      setError(err?.message || 'Failed to upload template');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    try {
      await deleteAsset(templateId);
      await loadTemplates();
    } catch (err) {
      setError(err?.message || 'Failed to delete template');
    }
  };

  return (
    <NotaryWorkspaceShell title="Settings" subtitle="Configure your account, notifications and document templates">
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

      <section className="notary-card">
        <div className="notary-card-header">Upload Document Template</div>
        <div className="notary-card-body">
          <div className="form-grid">
            <div className="form-row">
              <label>Template Name</label>
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Power of Attorney Template"
              />
            </div>
            <div className="form-row">
              <label>Template File</label>
              <input type="file" accept=".pdf,image/*" onChange={handleUploadTemplate} disabled={uploading} />
            </div>
            <div className="form-row" style={{ gridColumn: '1 / -1' }}>
              <label>Notes</label>
              <textarea
                value={templateNotes}
                onChange={(e) => setTemplateNotes(e.target.value)}
                placeholder="Add notes, instructions, and usage details"
              />
            </div>
          </div>
          {uploading ? <p className="muted">Uploading template...</p> : null}
          {error ? <p className="muted">{error}</p> : null}
        </div>
      </section>

      <section className="notary-card">
        <div className="notary-card-header">Document Templates</div>
        <div className="notary-card-body notary-table-wrap">
          {templates.length === 0 ? <div className="empty-block">No templates uploaded yet.</div> : null}
          {templates.length > 0 ? (
            <table className="notary-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td>{template.name || '-'}</td>
                    <td>{template.text || '-'}</td>
                    <td>
                      <button className="notary-btn secondary" onClick={() => handleDeleteTemplate(template.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </section>
    </NotaryWorkspaceShell>
  );
};

export default NotarySettingsPage;
