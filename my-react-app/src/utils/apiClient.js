// API Client for backend communication
const configuredApiBaseUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_REACT_APP_SERVER_URL ||
  import.meta.env.VITE_API_BASE_URL;

const isDev = Boolean(import.meta.env.DEV);
const DEV_LOCAL_API_BASES = ['http://localhost:5000', 'http://localhost:5001', 'http://localhost:5002'];
const API_BASE_STORAGE_KEY = 'notary.apiBaseUrl';
const isBrowser = typeof window !== 'undefined';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const isLocalPageHost = isBrowser
  ? LOOPBACK_HOSTS.has(String(window.location.hostname || '').toLowerCase())
  : false;

const isLoopbackUrl = (value) => {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return LOOPBACK_HOSTS.has(String(parsed.hostname || '').toLowerCase());
  } catch {
    return false;
  }
};

const resolveReachableBaseUrl = (value) => {
  if (!value || typeof value !== 'string') return null;
  if (isLocalPageHost) return value;
  return isLoopbackUrl(value) ? null : value;
};

const configuredReachableApiBaseUrl = resolveReachableBaseUrl(configuredApiBaseUrl);

const API_BASE_CANDIDATES = [
  ...(isDev && isLocalPageHost ? DEV_LOCAL_API_BASES : []),
  configuredReachableApiBaseUrl,
  (isBrowser ? window.location.origin : ''),
].filter((v) => typeof v === 'string' && v.trim() !== '');

// Deduplicate while preserving order
const uniqueCandidates = [...new Set(API_BASE_CANDIDATES)];

const finalApiCandidates = uniqueCandidates.length ? uniqueCandidates : ['http://localhost:5001'];

const API_CANDIDATES = finalApiCandidates;

const storedApiBaseUrl =
  (isBrowser && window.localStorage.getItem(API_BASE_STORAGE_KEY)) ||
  null;

const normalizedStoredApiBaseUrl = (() => {
  if (!storedApiBaseUrl) return null;
  const reachableStoredUrl = resolveReachableBaseUrl(storedApiBaseUrl);
  if (!reachableStoredUrl) return null;
  if (!isDev) return storedApiBaseUrl;

  const normalized = String(storedApiBaseUrl).trim().toLowerCase();
  const isLocalDevApi = DEV_LOCAL_API_BASES.some((base) => base.toLowerCase() === normalized);
  if (isLocalPageHost) {
    return isLocalDevApi ? storedApiBaseUrl : null;
  }
  return reachableStoredUrl;
})();

const preferredConfiguredApiBaseUrl = (() => {
  if (!configuredApiBaseUrl || !configuredReachableApiBaseUrl) return null;
  if (!isDev) return configuredReachableApiBaseUrl;

  const normalized = String(configuredApiBaseUrl).trim().toLowerCase();
  const isLocalDevApi = DEV_LOCAL_API_BASES.some((base) => base.toLowerCase() === normalized);
  if (isLocalPageHost) {
    return isLocalDevApi ? configuredApiBaseUrl : null;
  }
  return configuredReachableApiBaseUrl;
})();

if (isBrowser && configuredReachableApiBaseUrl && storedApiBaseUrl && storedApiBaseUrl !== configuredReachableApiBaseUrl) {
  if (!isDev || preferredConfiguredApiBaseUrl) {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, configuredReachableApiBaseUrl);
  }
}

let lastWorkingApiBaseUrl =
  preferredConfiguredApiBaseUrl ||
  normalizedStoredApiBaseUrl ||
  API_CANDIDATES[0];

const getBaseUrlPriority = () => {
  const ordered = [lastWorkingApiBaseUrl, ...API_CANDIDATES];
  return [...new Set(ordered)];
};

const getAuthToken = () => {
  try {
    const authUser = JSON.parse(localStorage.getItem('notary.authUser') || 'null');
    return authUser?.token || null;
  } catch {
    return null;
  }
};

const withAuthOptions = (options = {}) => {
  const token = getAuthToken();
  const headers = {
    ...(options.headers || {}),
  };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  return {
    ...options,
    headers,
  };
};

async function fetchWithFallback(path, options = {}) {
  let networkError = null;
  const requestOptions = withAuthOptions(options);

  for (const baseUrl of getBaseUrlPriority()) {
    try {
      const response = await fetch(`${baseUrl}${path}`, requestOptions);
      lastWorkingApiBaseUrl = baseUrl;
      if (isBrowser) {
        window.localStorage.setItem(API_BASE_STORAGE_KEY, baseUrl);
      }
      return response;
    } catch (error) {
      networkError = error;
    }
  }

  throw networkError || new Error('Unable to connect to backend server');
}

async function fetchWithNotFoundFallback(path, options = {}) {
  let networkError = null;
  let lastNotFoundResponse = null;
  const requestOptions = withAuthOptions(options);

  for (const baseUrl of getBaseUrlPriority()) {
    try {
      const response = await fetch(`${baseUrl}${path}`, requestOptions);

      if (response.status === 404) {
        lastNotFoundResponse = response;
        continue;
      }

      lastWorkingApiBaseUrl = baseUrl;
      if (isBrowser) {
        window.localStorage.setItem(API_BASE_STORAGE_KEY, baseUrl);
      }
      return response;
    } catch (error) {
      networkError = error;
    }
  }

  if (lastNotFoundResponse) return lastNotFoundResponse;
  throw networkError || new Error('Unable to connect to backend server');
}

const API_BASE_URL =
  configuredReachableApiBaseUrl ||
  (isBrowser ? window.location.origin : '') ||
  (isDev ? 'http://localhost:5001' : '');

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

async function fetchAdminOverview() {
  const response = await fetchWithFallback('/api/admin/overview');
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to fetch admin overview');
  }

  return payload;
}

async function fetchAdminUserInfo(userId) {
  const response = await fetchWithNotFoundFallback(`/api/admin/users/${encodeURIComponent(userId)}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to fetch user details');
  }

  return payload;
}

async function updateAdminUser(userId, userData) {
  const response = await fetchWithNotFoundFallback(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to update user');
  }

  return payload;
}

async function deleteAdminUser(userId) {
  const response = await fetchWithNotFoundFallback(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to delete user');
  }

  return payload;
}

async function terminateAdminSession(sessionId, payload = {}) {
  const response = await fetchWithNotFoundFallback(`/api/admin/sessions/${encodeURIComponent(sessionId)}/terminate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'Failed to terminate session');
  }

  return result;
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
    const url = '/api/signer-documents';
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
    const url = `/api/signer-documents${query}`;
    console.log('[fetchOwnerDocuments] Fetching from:', url);

    const response = await fetchWithFallback(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch signer documents`);
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

async function downloadOwnerDocument(documentId) {
  if (!documentId) {
    throw new Error('documentId is required for downloadOwnerDocument');
  }

  const response = await fetchWithFallback(`/api/signer-documents/${documentId}/download`, {
    method: 'GET',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}: Failed to download signer document`);
  }

  const contentDisposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/.exec(contentDisposition);
  const filename = filenameMatch ? filenameMatch[1] : `document-${documentId}.pdf`;
  const blob = await response.blob();

  return { blob, filename };
}

async function downloadNotarizedOwnerDocument(documentId) {
  if (!documentId) {
    throw new Error('documentId is required for downloadNotarizedOwnerDocument');
  }

  const response = await fetchWithFallback(`/api/signer-documents/${documentId}/notarized`, {
    method: 'GET',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}: Failed to download notarized document`);
  }

  const contentDisposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/.exec(contentDisposition);
  const filename = filenameMatch ? filenameMatch[1] : `document-${documentId}-notarized.pdf`;
  const blob = await response.blob();

  return { blob, filename };
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
    const url = `/api/signer-documents/${documentId}/review`;
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
    const url = `/api/signer-documents/${documentId}`;
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
    const url = `/api/signer-documents/${documentId}/session-started`;
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

async function completeOwnerDocumentNotarization(documentId, notaryName, notarizedDataUrl, sessionAmount) {
  try {
    const url = `/api/signer-documents/${documentId}/notarize`;
    console.log('[completeOwnerDocumentNotarization] Notarizing:', documentId);

    const payload = { notaryName };
    if (notarizedDataUrl) payload.notarizedDataUrl = notarizedDataUrl;
    if (sessionAmount !== undefined && sessionAmount !== null && sessionAmount !== '') {
      payload.sessionAmount = Number(sessionAmount);
    }

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

async function payOwnerDocumentSession(documentId, paymentPayload = {}) {
  try {
    const url = `/api/signer-documents/${documentId}/pay`;
    const response = await fetchWithFallback(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentPayload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'Failed to complete payment');
    }

    return result;
  } catch (error) {
    console.error('[payOwnerDocumentSession] ❌ Error:', error);
    throw error;
  }
}

async function notarizeOwnerDocument(documentId) {
  try {
    const url = `/api/signer-documents/${documentId}/signer-notarize`;
    console.log('[notarizeOwnerDocument] Notarizing:', documentId);

    const response = await fetchWithFallback(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    console.log('[notarizeOwnerDocument] ✅ Notarized:', documentId);
    return responseData;
  } catch (error) {
    console.error('[notarizeOwnerDocument] ❌ Error:', error);
    throw error;
  }
}

async function endOwnerDocumentSession(documentId, sessionId, notaryName, notaryUserId) {
  try {
    const url = `/api/signer-documents/${documentId}/session-ended`;
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

async function sendKbaOtp(destination, channel = 'sms') {
  const response = await fetchWithFallback('/api/kba/otp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination, channel }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to send OTP');
  return payload;
}

async function verifyKbaOtp(otp) {
  const response = await fetchWithFallback('/api/kba/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to verify OTP');
  return payload;
}

async function uploadKbaDocument(payload) {
  const response = await fetchWithFallback('/api/kba/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(responsePayload.error || 'Failed to upload KBA document');
  return responsePayload;
}

async function fetchKbaStatus() {
  const response = await fetchWithFallback('/api/kba/status');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to fetch KBA status');
  return payload;
}

async function cancelKba() {
  const response = await fetchWithFallback('/api/kba/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to cancel KBA');
  return payload;
}

async function fetchPendingKbaQueue() {
  const response = await fetchWithFallback('/api/admin/kba/pending');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to fetch KBA queue');
  return payload;
}

async function approveKbaSubmission(userId) {
  const response = await fetchWithFallback(`/api/admin/kba/${userId}/approve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to approve KBA submission');
  return payload;
}

async function rejectKbaSubmission(userId, reason) {
  const response = await fetchWithFallback(`/api/admin/kba/${userId}/reject`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to reject KBA submission');
  return payload;
}

function getKbaDocumentUrl(userId, side = 'front') {
  const baseUrl = lastWorkingApiBaseUrl || API_CANDIDATES[0] || '';
  const token = getAuthToken();
  return `${baseUrl}/api/admin/kba/${userId}/document?side=${encodeURIComponent(side)}${token ? `&auth=${encodeURIComponent(token)}` : ''}`;
}

async function fetchKbaDocumentAsBlob(userId, side = 'front') {
  const endpoint = `/api/admin/kba/${encodeURIComponent(userId)}/document?side=${encodeURIComponent(side)}`;

  try {
    const response = await fetchWithFallback(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/octet-stream',
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // ignore non-JSON error body
      }
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    if (blob.size === 0) throw new Error('Document is empty (0 bytes)');
    return blob;
  } catch (err) {
    console.error('[fetchKbaDocumentAsBlob] Failed:', err);
    throw new Error(err?.message || 'Failed to fetch KBA document');
  }
}

async function debugFetchKbaSubmissions() {
  const response = await fetchWithFallback('/api/debug/kba-submissions');
  return await response.json().catch(() => ({}));
}

async function scheduleOwnerDocumentMeeting(documentId, scheduledAt) {
  const response = await fetchWithFallback(`/api/signer-documents/${documentId}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduledAt }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const responseData = await response.json();
  return responseData;
}

async function fetchNotaryDashboardStats() {
  try {
    const response = await fetchWithFallback('/api/notary/dashboard/stats', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    return responseData;
  } catch (error) {
    console.error('[fetchNotaryDashboardStats] Error:', error);
    throw error;
  }
}

async function uploadSessionRecording(recordingPayload) {
  const response = await fetchWithFallback('/api/recordings/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(recordingPayload),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to upload recording');
  }

  return payload;
}

async function fetchSessionRecordings({ sessionId, status, provider } = {}) {
  const params = new URLSearchParams();
  if (sessionId) params.append('sessionId', sessionId);
  if (status) params.append('status', status);
  if (provider) params.append('provider', provider);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetchWithFallback(`/api/recordings${query}`, {
    method: 'GET',
  });

  const payload = await response.json().catch(() => ([]));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to fetch recordings');
  }

  return Array.isArray(payload) ? payload : [];
}

async function extractSignatureCandidatesWithYolo({ dataUrl, pageNumber = 1, confidence = 0.25, iou = 0.45, maxDetections = 15 } = {}) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('A PDF or image data URL is required for signature extraction');
  }

  const response = await fetchWithFallback('/api/signature-extract-yolo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dataUrl,
      pageNumber,
      confidence,
      iou,
      maxDetections,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to extract signatures using YOLO');
  }

  return payload;
}

export {
  saveSignature,
  fetchSignatures,
  deleteSignature,
  saveAsset,
  fetchAssets,
  deleteAsset,
  registerUser,
  loginUser,
  fetchUsers,
  fetchAdminOverview,
  fetchAdminUserInfo,
  updateAdminUser,
  deleteAdminUser,
  terminateAdminSession,
  saveDocument,
  saveOwnerDocument,
  fetchDocuments,
  fetchOwnerDocuments,
  fetchNotarizedDocuments,
  downloadOwnerDocument,
  downloadNotarizedOwnerDocument,
  updateDocumentReview,
  updateOwnerDocumentReview,
  deleteOwnerDocument,
  notarizeOwnerDocument,
  markOwnerDocumentSessionStarted,
  completeOwnerDocumentNotarization,
  payOwnerDocumentSession,
  endOwnerDocumentSession,
  sendKbaOtp,
  verifyKbaOtp,
  uploadKbaDocument,
  fetchKbaStatus,
  cancelKba,
  fetchPendingKbaQueue,
  approveKbaSubmission,
  rejectKbaSubmission,
  getKbaDocumentUrl,
  fetchKbaDocumentAsBlob,
  debugFetchKbaSubmissions,
  scheduleOwnerDocumentMeeting,
  fetchNotaryDashboardStats,
  uploadSessionRecording,
  fetchSessionRecordings,
  extractSignatureCandidatesWithYolo,
  API_BASE_URL,
};

