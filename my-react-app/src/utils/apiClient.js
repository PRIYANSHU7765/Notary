// API Client for backend communication
const configuredApiBaseUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_REACT_APP_SERVER_URL ||
  import.meta.env.VITE_API_BASE_URL;

const isDev = Boolean(import.meta.env.DEV);
const API_BASE_STORAGE_KEY = 'notary.apiBaseUrl';
const API_BASE_CANDIDATES = [
  configuredApiBaseUrl,
  ...(isDev ? ['', 'http://localhost:5001', 'http://localhost:5002', 'http://localhost:5000'] : []),
].filter((v) => v !== undefined && v !== null); // keep '' in the list

let lastWorkingApiBaseUrl =
  (typeof window !== 'undefined' && window.localStorage.getItem(API_BASE_STORAGE_KEY)) ||
  API_BASE_CANDIDATES[0];

const getBaseUrlPriority = () => {
  const ordered = [lastWorkingApiBaseUrl, ...API_BASE_CANDIDATES];
  return [...new Set(ordered)];
};

async function fetchWithFallback(path, options = {}) {
  let networkError = null;

  for (const baseUrl of getBaseUrlPriority()) {
    try {
      const response = await fetch(`${baseUrl}${path}`, options);
      lastWorkingApiBaseUrl = baseUrl;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(API_BASE_STORAGE_KEY, baseUrl);
      }
      return response;
    } catch (error) {
      networkError = error;
    }
  }

  throw networkError || new Error('Unable to connect to backend server');
}

const API_BASE_URL = configuredApiBaseUrl || (isDev ? 'http://localhost:5001' : '');

console.log('[API Client] Base URL:', API_BASE_URL);

async function registerUser(userData) {
  const response = await fetchWithFallback('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Registration failed');
  }

  return payload;
}

async function loginUser(credentials) {
  const response = await fetchWithFallback('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Login failed');
  }

  return payload;
}

async function fetchUsers() {
  try {
    const response = await fetchWithFallback('/api/users');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch users`);
    }

    const users = await response.json();
    return Array.isArray(users) ? users : [];
  } catch (error) {
    console.error('[fetchUsers] ❌ Error:', error);
    return [];
  }
}

async function saveSignature(signatureData) {
  try {
    const url = '/api/signatures';
    console.log('[saveSignature] Sending to:', url);
    console.log('[saveSignature] Data:', { id: signatureData.id, name: signatureData.name, userRole: signatureData.userRole });

    const response = await fetchWithFallback(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(signatureData),
    });

    console.log('[saveSignature] Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[saveSignature] ✅ Success:', responseData.id);
    return responseData;
  } catch (error) {
    console.error('[saveSignature] ❌ Error:', error);
    throw error;
  }
}

async function fetchSignatures(userRole, { sessionId, userId } = {}) {
  try {
    const params = new URLSearchParams();
    if (sessionId) params.append('sessionId', sessionId);
    if (userId) params.append('userId', userId);

    const query = params.toString() ? `?${params.toString()}` : '';
    const url = `/api/signatures/${userRole}${query}`;
    console.log('[fetchSignatures] Fetching from:', url);

    const response = await fetchWithFallback(url);
    console.log('[fetchSignatures] Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch signatures`);
    }

    const responseData = await response.json();
    console.log('[fetchSignatures] ✅ Got', responseData.length, 'signatures');
    return responseData;
  } catch (error) {
    console.error('[fetchSignatures] ❌ Error:', error);
    return [];
  }
}

async function deleteSignature(signatureId) {
  try {
    const url = `/api/signatures/${signatureId}`;
    console.log('[deleteSignature] Deleting:', url);

    const response = await fetchWithFallback(url, {
      method: 'DELETE',
    });

    console.log('[deleteSignature] Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to delete signature`);
    }

    const responseData = await response.json();
    console.log('[deleteSignature] ✅ Success');
    return responseData;
  } catch (error) {
    console.error('[deleteSignature] ❌ Error:', error);
    throw error;
  }
}

async function saveAsset(assetData) {
  try {
    const url = '/api/assets';
    console.log('[saveAsset] Sending asset:', { id: assetData.id, name: assetData.name, type: assetData.type });

    const response = await fetchWithFallback(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(assetData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[saveAsset] ✅ Saved:', responseData.id);
    return responseData;
  } catch (error) {
    console.error('[saveAsset] ❌ Error:', error);
    throw error;
  }
}

async function fetchAssets(userRole, { sessionId, userId } = {}) {
  try {
    const params = new URLSearchParams();
    if (sessionId) params.append('sessionId', sessionId);
    if (userId) params.append('userId', userId);

    const query = params.toString() ? `?${params.toString()}` : '';
    const url = `/api/assets/${userRole}${query}`;
    console.log('[fetchAssets] Fetching from:', url);

    const response = await fetchWithFallback(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch assets`);
    }

    const responseData = await response.json();
    console.log('[fetchAssets] ✅ Got', responseData.length, 'assets');
    return responseData;
  } catch (error) {
    console.error('[fetchAssets] ❌ Error:', error);
    return [];
  }
}

async function deleteAsset(assetId) {
  try {
    const url = `/api/assets/${assetId}`;
    console.log('[deleteAsset] Deleting:', assetId);

    const response = await fetchWithFallback(url, { method: 'DELETE' });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[deleteAsset] ✅ Deleted');
    return responseData;
  } catch (error) {
    console.error('[deleteAsset] ❌ Error:', error);
    throw error;
  }
}

async function saveDocument(documentData) {
  try {
    const url = '/api/documents';
    console.log('[saveDocument] Sending document:', { id: documentData.id, name: documentData.name });

    const response = await fetchWithFallback(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(documentData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[saveDocument] ✅ Saved:', responseData.id);
    return responseData;
  } catch (error) {
    console.error('[saveDocument] ❌ Error:', error);
    throw error;
  }
}

async function saveOwnerDocument(documentData) {
  try {
    const url = '/api/owner-documents';
    console.log('[saveOwnerDocument] Sending document:', { id: documentData.id, name: documentData.name });

    const response = await fetchWithFallback(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(documentData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[saveOwnerDocument] ✅ Saved:', responseData.id);
    return responseData;
  } catch (error) {
    console.error('[saveOwnerDocument] ❌ Error:', error);
    throw error;
  }
}

async function fetchDocuments({ sessionId, ownerId } = {}) {
  try {
    const params = new URLSearchParams();
    if (sessionId) params.append('sessionId', sessionId);
    if (ownerId) params.append('ownerId', ownerId);

    const query = params.toString() ? `?${params.toString()}` : '';
    const url = `/api/documents${query}`;
    console.log('[fetchDocuments] Fetching from:', url);

    const response = await fetchWithFallback(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch documents`);
    }

    const responseData = await response.json();
    console.log('[fetchDocuments] ✅ Got', responseData.length, 'documents');
    return responseData;
  } catch (error) {
    console.error('[fetchDocuments] ❌ Error:', error);
    return [];
  }
}

async function fetchOwnerDocuments({ ownerId, sessionId, inProcess, notarized } = {}) {
  try {
    const params = new URLSearchParams();
    if (ownerId) params.append('ownerId', ownerId);
    if (sessionId) params.append('sessionId', sessionId);
    if (inProcess !== undefined) params.append('inProcess', inProcess ? '1' : '0');
    if (notarized !== undefined) params.append('notarized', notarized ? '1' : '0');

    const query = params.toString() ? `?${params.toString()}` : '';
    const url = `/api/owner-documents${query}`;
    console.log('[fetchOwnerDocuments] Fetching from:', url);

    const response = await fetchWithFallback(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch owner documents`);
    }

    const responseData = await response.json();
    console.log('[fetchOwnerDocuments] ✅ Got', responseData.length, 'documents');
    return responseData;
  } catch (error) {
    console.error('[fetchOwnerDocuments] ❌ Error:', error);
    return [];
  }
}

async function fetchNotarizedDocuments({ sessionId, ownerId } = {}) {
  try {
    const params = new URLSearchParams();
    if (sessionId) params.append('sessionId', sessionId);
    if (ownerId) params.append('ownerId', ownerId);

    const query = params.toString() ? `?${params.toString()}` : '';
    const url = `/api/documents/notarized${query}`;
    console.log('[fetchNotarizedDocuments] Fetching from:', url);

    const response = await fetchWithFallback(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch documents`);
    }

    const responseData = await response.json();
    console.log('[fetchNotarizedDocuments] ✅ Got', responseData.length, 'documents');
    return responseData;
  } catch (error) {
    console.error('[fetchNotarizedDocuments] ❌ Error:', error);
    return [];
  }
}

async function updateDocumentReview(documentId, notaryReview, notaryName) {
  try {
    const url = `/api/documents/${documentId}/review`;
    console.log('[updateDocumentReview] Updating:', documentId, 'as', notaryReview);

    const response = await fetchWithFallback(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notaryReview, notaryName }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[updateDocumentReview] ✅ Updated');
    return responseData;
  } catch (error) {
    console.error('[updateDocumentReview] ❌ Error:', error);
    throw error;
  }
}

async function updateOwnerDocumentReview(documentId, notaryReview, notaryName) {
  try {
    const url = `/api/owner-documents/${documentId}/review`;
    console.log('[updateOwnerDocumentReview] Updating:', documentId, 'as', notaryReview);

    const response = await fetchWithFallback(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notaryReview, notaryName }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[updateOwnerDocumentReview] ✅ Updated');
    return responseData;
  } catch (error) {
    console.error('[updateOwnerDocumentReview] ❌ Error:', error);
    throw error;
  }
}

async function deleteOwnerDocument(documentId) {
  try {
    const url = `/api/owner-documents/${documentId}`;
    console.log('[deleteOwnerDocument] Deleting:', documentId);

    const response = await fetchWithFallback(url, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[deleteOwnerDocument] ✅ Deleted');
    return responseData;
  } catch (error) {
    console.error('[deleteOwnerDocument] ❌ Error:', error);
    throw error;
  }
}

async function markOwnerDocumentSessionStarted(documentId, sessionId, notaryName, notaryUserId) {
  try {
    const url = `/api/owner-documents/${documentId}/session-started`;
    console.log('[markOwnerDocumentSessionStarted] Updating:', documentId, sessionId);

    const response = await fetchWithFallback(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, notaryName, notaryUserId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[markOwnerDocumentSessionStarted] ✅ Updated');
    return responseData;
  } catch (error) {
    console.error('[markOwnerDocumentSessionStarted] ❌ Error:', error);
    throw error;
  }
}

async function completeOwnerDocumentNotarization(documentId, notaryName, notarizedDataUrl) {
  try {
    const url = `/api/owner-documents/${documentId}/notarize`;
    console.log('[completeOwnerDocumentNotarization] Notarizing:', documentId);

    const payload = { notaryName };
    if (notarizedDataUrl) payload.notarizedDataUrl = notarizedDataUrl;

    const response = await fetchWithFallback(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[completeOwnerDocumentNotarization] ✅ Notarized');
    return responseData;
  } catch (error) {
    console.error('[completeOwnerDocumentNotarization] ❌ Error:', error);
    throw error;
  }
}

async function endOwnerDocumentSession(documentId, sessionId, notaryName, notaryUserId) {
  try {
    const url = `/api/owner-documents/${documentId}/session-ended`;
    console.log('[endOwnerDocumentSession] Ending:', documentId, sessionId);

    const response = await fetchWithFallback(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, notaryName, notaryUserId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[endOwnerDocumentSession] Success');
    return responseData;
  } catch (error) {
    console.error('[endOwnerDocumentSession] Error:', error);
    throw error;
  }
}
export { saveSignature, fetchSignatures, deleteSignature, saveAsset, fetchAssets, deleteAsset, registerUser, loginUser, fetchUsers, saveDocument, saveOwnerDocument, fetchDocuments, fetchOwnerDocuments, fetchNotarizedDocuments, updateDocumentReview, updateOwnerDocumentReview, deleteOwnerDocument, markOwnerDocumentSessionStarted, completeOwnerDocumentNotarization, endOwnerDocumentSession, API_BASE_URL };

