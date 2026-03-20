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
      if (typeof window !== 'undefined') {
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

async function sendKbaOtp(destination, channel = 'sms') {
  const response = await fetchWithFallback('/api/kba/otp/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ destination, channel }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to send OTP');
  return payload;
}

async function verifyKbaOtp(otp) {
  const response = await fetchWithFallback('/api/kba/otp/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ otp }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to verify OTP');
  return payload;
}

async function uploadKbaDocument(payload) {
  // Accept entire payload object with documentType, front, and back
  // payload shape: { documentType, front: { fileName, mimeType, documentDataUrl }, back: { ... } }
  console.log('[uploadKbaDocument] Sending payload:', {
    documentType: payload.documentType,
    frontFileName: payload.front?.fileName,
    backFileName: payload.back?.fileName,
    frontDataUrlLength: payload.front?.documentDataUrl?.length || 0,
    backDataUrlLength: payload.back?.documentDataUrl?.length || 0,
  });
  
  const response = await fetchWithFallback('/api/kba/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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
    headers: {
      'Content-Type': 'application/json',
    },
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
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to approve KBA submission');
  return payload;
}

async function rejectKbaSubmission(userId, reason) {
  const response = await fetchWithFallback(`/api/admin/kba/${userId}/reject`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to reject KBA submission');
  return payload;
}

function getKbaDocumentUrl(userId, side = 'front') {
  const baseUrl = lastWorkingApiBaseUrl || API_BASE_CANDIDATES[0] || '';
  const token = getAuthToken();
  return `${baseUrl}/api/admin/kba/${userId}/document?side=${encodeURIComponent(side)}${token ? `&auth=${encodeURIComponent(token)}` : ''}`;
}

async function fetchKbaDocumentAsBlob(userId, side = 'front') {
  const token = getAuthToken();
  if (!token) throw new Error('No authentication token found');
  
  const baseUrl = lastWorkingApiBaseUrl || API_BASE_CANDIDATES[0] || '';
  const url = `${baseUrl}/api/admin/kba/${userId}/document?side=${encodeURIComponent(side)}`;
  
  console.log('[fetchKbaDocumentAsBlob] Fetching from:', url);
  console.log('[fetchKbaDocumentAsBlob] Token exists:', !!token);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    console.log('[fetchKbaDocumentAsBlob] Response status:', response.status);
    
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) {
        // Could not parse error response
      }
      console.error('[fetchKbaDocumentAsBlob] Error:', errorMessage);
      throw new Error(errorMessage);
    }
    
    const blob = await response.blob();
    console.log('[fetchKbaDocumentAsBlob] Blob size:', blob.size);
    
    if (blob.size === 0) {
      throw new Error('Document is empty (0 bytes)');
    }
    
    return blob;
  } catch (err) {
    console.error('[fetchKbaDocumentAsBlob] Fetch failed:', err.message);
    throw err;
  }
}

async function debugFetchKbaSubmissions() {
  const response = await fetchWithFallback('/api/debug/kba-submissions');
  return await response.json().catch(() => ({}));
}

export { saveSignature, fetchSignatures, deleteSignature, saveAsset, fetchAssets, deleteAsset, registerUser, loginUser, fetchUsers, fetchAdminOverview, fetchAdminUserInfo, updateAdminUser, deleteAdminUser, terminateAdminSession, saveDocument, saveOwnerDocument, fetchDocuments, fetchOwnerDocuments, fetchNotarizedDocuments, updateDocumentReview, updateOwnerDocumentReview, deleteOwnerDocument, markOwnerDocumentSessionStarted, completeOwnerDocumentNotarization, endOwnerDocumentSession, sendKbaOtp, verifyKbaOtp, uploadKbaDocument, cancelKba, fetchKbaStatus, fetchPendingKbaQueue, approveKbaSubmission, rejectKbaSubmission, getKbaDocumentUrl, fetchKbaDocumentAsBlob, debugFetchKbaSubmissions, API_BASE_URL };

