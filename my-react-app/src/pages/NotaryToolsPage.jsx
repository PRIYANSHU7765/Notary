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
      subtitle="Core notary utilities"
    >
      <div className="page-stack">
        <section className="notary-card">
          <div className="notary-card-header">Document Templates</div>
          <div className="notary-card-body">
            <p className="muted">Template configuration and upload have moved to Settings.</p>
            <div className="inline-actions">
              <button className="notary-btn" onClick={() => navigate('/notary/settings')}>
                Open Settings
              </button>
            </div>
          </div>
        </section>

        <section className="section-grid">
          <article className="notary-card">
            <div className="notary-card-header">Other Tools</div>
            <div className="notary-card-body">
              <p className="muted">Use additional workflow tools to complete notary operations.</p>
              <div className="inline-actions">
                <button className="notary-btn" onClick={() => navigate('/notary/meetings')}>
                  Open Meetings Queue
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
