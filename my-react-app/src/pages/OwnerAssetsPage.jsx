import React, { useEffect, useMemo, useRef, useState } from 'react';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import SignatureExtractionModal from '../components/SignatureExtractionModal';
import SignaturePad from '../components/SignaturePad';
import { saveAsset, saveSignature, fetchAssets, fetchSignatures, deleteAsset, deleteSignature } from '../utils/apiClient';
import './NotaryWorkspacePages.css';

const OwnerAssetsPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assets, setAssets] = useState([]);
  const [signatures, setSignatures] = useState([]);
  const [selectedPreview, setSelectedPreview] = useState(null);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [showUploadAssetForm, setShowUploadAssetForm] = useState(false);
  const [uploadAssetDataUrl, setUploadAssetDataUrl] = useState('');
  const [uploadAssetName, setUploadAssetName] = useState('');
  const [uploadAssetType, setUploadAssetType] = useState('image');
  const fileInputRef = useRef(null);

  const authUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('notary.authUser') || 'null') || {};
    } catch {
      return {};
    }
  }, []);

  const userId = authUser?.userId || authUser?.id || null;
  const sessionId = authUser?.sessionId || authUser?.currentSessionId || null;
  const fallbackSessionId = sessionId || localStorage.getItem('notary.lastSessionId') || authUser?.userId || `session-${Date.now()}`;

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const [fetchedAssets, fetchedSignatures] = await Promise.all([
        fetchAssets('signer', { userId }),
        fetchSignatures('signer', { userId }),
      ]);

      setAssets(Array.isArray(fetchedAssets) ? fetchedAssets : []);
      setSignatures(Array.isArray(fetchedSignatures) ? fetchedSignatures : []);
    } catch (err) {
      setError(err?.message || 'Failed to load assets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const allItems = useMemo(() => {
    const formattedAssets = assets.map((asset) => ({
      id: asset.id,
      name: asset.name || 'Untitled Asset',
      type: asset.type || 'asset',
      image: asset.image || asset.imageUrl || null,
      createdAt: asset.createdAt,
      source: 'asset',
    }));

    const formattedSignatures = signatures.map((sig) => ({
      id: sig.id,
      name: sig.name || 'Untitled Signature',
      type: 'signature',
      image: sig.image || null,
      createdAt: sig.createdAt,
      source: 'signature',
    }));

    return [...formattedAssets, ...formattedSignatures].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  }, [assets, signatures]);

  const handleDelete = async (item) => {
    try {
      if (item.source === 'asset') {
        await deleteAsset(item.id);
        setAssets((prev) => prev.filter((asset) => asset.id !== item.id));
      } else {
        await deleteSignature(item.id);
        setSignatures((prev) => prev.filter((sig) => sig.id !== item.id));
      }
    } catch (err) {
      setError(err?.message || 'Failed to delete item');
    }
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(Number(value) || value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  return (
    <NotaryWorkspaceShell sidebarRole="signer" title="Assets" subtitle="Your signatures and uploaded assets">
      <div className="page-stack">
        {showExtractModal && (
          <SignatureExtractionModal
            open={showExtractModal}
            pdfDataUrl={uploadAssetDataUrl || ''}
            onClose={() => setShowExtractModal(false)}
            onSave={async ({ imageDataUrl }) => {
              try {
                const id = `sig-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                await saveSignature({
                  id,
                  sessionId: fallbackSessionId,
                  userId,
                  username: authUser.username || '',
                  name: `Extracted Signature ${new Date().toLocaleString()}`,
                  image: imageDataUrl,
                  userRole: 'signer',
                });
                await loadData();
              } catch (err) {
                setError(err?.message || 'Failed to save extracted signature');
              }
            }}
          />
        )}

        {showSignaturePad && (
          <div className="notary-card" style={{ position: 'relative', zIndex: 10 }}>
            <div className="notary-card-header">Sign Here</div>
            <div className="notary-card-body">
              <SignaturePad
                onSave={async (signatureDataUrl) => {
                  try {
                    const id = `signature-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                    await saveSignature({
                      id,
                      sessionId: fallbackSessionId,
                      userId,
                      username: authUser.username || '',
                      name: `Uploaded Signature ${new Date().toLocaleString()}`,
                      image: signatureDataUrl,
                      userRole: 'signer',
                    });
                    setShowSignaturePad(false);
                    await loadData();
                  } catch (err) {
                    setError(err?.message || 'Failed to save signature');
                  }
                }}
                onCancel={() => setShowSignaturePad(false)}
              />
            </div>
          </div>
        )}

        <section className="notary-card">
          <div className="notary-card-header">Asset Summary</div>
          <div className="notary-card-body">
            {loading ? <p className="muted">Loading asset inventory...</p> : null}
            {!loading && error ? <p className="muted">{error}</p> : null}
            {!loading && !error && (
              <div className="kpi-grid">
                <div className="kpi-item">
                  <p className="kpi-label">Total Assets</p>
                  <p className="kpi-value">{assets.length}</p>
                </div>
                <div className="kpi-item">
                  <p className="kpi-label">Total Signatures</p>
                  <p className="kpi-value">{signatures.length}</p>
                </div>
                <div className="kpi-item">
                  <p className="kpi-label">Total Entries</p>
                  <p className="kpi-value">{allItems.length}</p>
                </div>
              </div>
            )}
            <div style={{ marginTop: '15px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <button className="notary-btn" onClick={() => setShowExtractModal(true)}>
                Extract Signature
              </button>
              <button className="notary-btn" onClick={() => setShowSignaturePad(true)}>
                Upload Signature
              </button>
              <button className="notary-btn" onClick={() => setShowUploadAssetForm((prev) => !prev)}>
                Upload Asset
              </button>
            </div>
            {showUploadAssetForm && (
              <div style={{ marginTop: '12px', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '8px' }}>
                <div style={{ marginBottom: '8px' }}>
                  <label>Asset Name</label>
                  <input
                    style={{ width: '100%', marginTop: '4px', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    value={uploadAssetName}
                    onChange={(e) => setUploadAssetName(e.target.value)}
                    placeholder="e.g. contract-page"
                  />
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label>Asset Type</label>
                  <select
                    style={{ width: '100%', marginTop: '4px', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                    value={uploadAssetType}
                    onChange={(e) => setUploadAssetType(e.target.value)}
                  >
                    <option value="image">Image</option>
                    <option value="pdf">PDF</option>
                    <option value="text">Text</option>
                  </select>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label>File/Data</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                      const isImage = file.type.startsWith('image/') || /\.(jpe?g|png)$/i.test(file.name);

                      if (!isPdf && !isImage) {
                        setError('Please choose a PNG, JPG, JPEG or PDF file.');
                        return;
                      }

                      if (isPdf) setUploadAssetType('pdf');
                      else setUploadAssetType('image');

                      try {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const url = reader.result || '';
                          setUploadAssetDataUrl(url);
                          setError('');
                        };
                        reader.onerror = () => setError('Failed to read file');
                        reader.readAsDataURL(file);
                      } catch (err) {
                        setError('Failed to read file');
                      }
                    }}
                    style={{ width: '100%', marginTop: '4px' }}
                  />
                </div>
                <button
                  className="notary-btn"
                  onClick={async () => {
                    if (!uploadAssetName || !uploadAssetDataUrl) {
                      setError('Name and file are required');
                      return;
                    }
                    try {
                      const id = `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                      await saveAsset({
                        id,
                        sessionId: sessionId || null,
                        userId,
                        username: authUser.username || '',
                        name: uploadAssetName,
                        type: uploadAssetType,
                        image: uploadAssetDataUrl,
                        text: null,
                        width: 0,
                        height: 0,
                        userRole: 'signer',
                      });
                      setUploadAssetName('');
                      setUploadAssetDataUrl('');
                      setShowUploadAssetForm(false);
                      loadData();
                    } catch (err) {
                      setError(err?.message || 'Failed to upload asset');
                    }
                  }}
                >
                  Save Asset
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="notary-card">
          <div className="notary-card-header">Your Assets & Signatures</div>
          <div className="notary-card-body notary-table-wrap">
            {!loading && !error && allItems.length === 0 ? (
              <div className="empty-block">No saved assets or signatures found.</div>
            ) : null}

            {!loading && !error && allItems.length > 0 ? (
              <table className="notary-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Created</th>
                    <th>Preview</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {allItems.map((item) => (
                    <tr key={`${item.source}-${item.id}`}>
                      <td>{item.type}</td>
                      <td>{item.name}</td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>
                        {item.image ? (
                          item.type === 'pdf' || item.image.startsWith('data:application/pdf') ? (
                            <a href={item.image} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>
                              Open PDF
                            </a>
                          ) : (
                            <img
                              src={item.image}
                              alt={item.name}
                              style={{ width: 80, height: 36, objectFit: 'contain', border: '1px solid #d1d5db', borderRadius: 4 }}
                              onClick={() => setSelectedPreview(item.image)}
                            />
                          )
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <button className="notary-btn secondary" onClick={() => handleDelete(item)}>
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

        {selectedPreview && (
          <section className="notary-card">
            <div className="notary-card-header">Preview</div>
            <div className="notary-card-body" style={{ textAlign: 'center' }}>
              {selectedPreview.startsWith('data:application/pdf') ? (
                <iframe src={selectedPreview} title="PDF preview" style={{ width: '100%', height: '420px', border: 'none' }} />
              ) : (
                <img src={selectedPreview} alt="Selected preview" style={{ maxWidth: '100%', maxHeight: '420px' }} />
              )}
              <div>
                <button className="notary-btn" style={{ marginTop: 8 }} onClick={() => setSelectedPreview(null)}>
                  Close Preview
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </NotaryWorkspaceShell>
  );
};

export default OwnerAssetsPage;
