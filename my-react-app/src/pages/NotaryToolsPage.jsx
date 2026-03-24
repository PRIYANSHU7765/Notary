import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import { deleteAsset, fetchAssets, saveAsset } from '../utils/apiClient';
import './NotaryWorkspacePages.css';

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const NotaryToolsPage = () => {
  const navigate = useNavigate();
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
    loadTemplates();
  }, []);

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
    <NotaryWorkspaceShell
      title="Tools"
      subtitle="Upload reusable document templates and access core notary utilities"
    >
      <div className="page-stack">
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

        <section className="section-grid">
          <article className="notary-card">
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
          </article>

          <article className="notary-card">
            <div className="notary-card-header">Other Tools</div>
            <div className="notary-card-body">
              <p className="muted">Use additional workflow tools to complete notary operations.</p>
              <div className="inline-actions">
                <button className="notary-btn" onClick={() => navigate('/notary/doc/dashboard')}>
                  Open Document Queue
                </button>
                <button className="notary-btn secondary" onClick={() => navigate('/notary')}>
                  Open Live Session Workspace
                </button>
              </div>
            </div>
          </article>
        </section>
      </div>
    </NotaryWorkspaceShell>
  );
};

export default NotaryToolsPage;
