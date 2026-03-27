// API Client for backend communication
const configuredApiBaseUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_REACT_APP_SERVER_URL ||
  import.meta.env.VITE_API_BASE_URL;

const isDev = Boolean(import.meta.env.DEV);
const DEV_LOCAL_API_BASES = ['http://localhost:5000', 'http://localhost:5001', 'http://localhost:5002'];
const API_BASE_STORAGE_KEY = 'notary.apiBaseUrl';
const API_CACHE_PREFIX = 'notary.apiCache';
const DEFAULT_API_CACHE_TTL_MS = 30 * 1000;
const DASHBOARD_CACHE_TTL_MS = 20 * 1000;
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

const finalApiCandidates = uniqueCandidates.length ? uniqueCandidates : ['http://localhost:5000'];

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

const pendingApiRequests = new Map();

const getCacheScope = () => {
  if (!isBrowser) return 'anon';
  try {
    const authUser = JSON.parse(window.localStorage.getItem('notary.authUser') || 'null');
    const userPart = authUser?.userId || authUser?.id || authUser?.email || authUser?.username;
    if (userPart) return `user:${String(userPart).toLowerCase()}`;
  } catch {
    // Ignore malformed auth data.
  }
  return 'anon';
};

const buildCacheStorageKey = (cacheKey) => `${API_CACHE_PREFIX}:${getCacheScope()}:${cacheKey}`;

const readApiCache = (cacheKey, ttlMs = DEFAULT_API_CACHE_TTL_MS) => {
  if (!isBrowser || !cacheKey) return null;

  try {
    const storageKey = buildCacheStorageKey(cacheKey);
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const timestamp = Number(parsed?.timestamp || 0);
    if (!timestamp || Date.now() - timestamp > ttlMs) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return parsed?.data ?? null;
  } catch {
    return null;
  }
};

const writeApiCache = (cacheKey, data) => {
  if (!isBrowser || !cacheKey) return;

  try {
    const storageKey = buildCacheStorageKey(cacheKey);
    const payload = {
      timestamp: Date.now(),
      data,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore quota/storage errors and continue with live API behavior.
  }
};

const invalidateApiCache = (matchers = []) => {
  if (!isBrowser) return;

  const normalizedMatchers = (Array.isArray(matchers) ? matchers : [matchers]).filter(Boolean);

  try {
    const keysToRemove = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(`${API_CACHE_PREFIX}:`)) continue;

      if (!normalizedMatchers.length) {
        keysToRemove.push(key);
        continue;
      }

      const cacheKey = key.slice(`${API_CACHE_PREFIX}:`.length);
      if (normalizedMatchers.some((matcher) => cacheKey.includes(matcher))) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore localStorage iteration issues.
  }
};

const fetchJsonWithCache = async (
  path,
  {
    method = 'GET',
    headers,
    ttlMs = DEFAULT_API_CACHE_TTL_MS,
    cacheKey = path,
    bypassCache = false,
  } = {}
) => {
  const upperMethod = String(method || 'GET').toUpperCase();
  const shouldUseGetCache = upperMethod === 'GET' && !bypassCache;
  const requestKey = shouldUseGetCache ? buildCacheStorageKey(cacheKey) : null;

  if (shouldUseGetCache) {
    const cached = readApiCache(cacheKey, ttlMs);
    if (cached !== null) return cached;

    const existing = pendingApiRequests.get(requestKey);
    if (existing) return existing;
  }

  const performRequest = async () => {
    const response = await fetchWithFallback(path, {
      method: upperMethod,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const payload = await response.json();
    if (upperMethod === 'GET') {
      writeApiCache(cacheKey, payload);
    }

    return payload;
  };

  const requestPromise = performRequest();

  if (requestKey) {
    pendingApiRequests.set(requestKey, requestPromise);
    requestPromise.finally(() => {
      pendingApiRequests.delete(requestKey);
    });
  }

  return requestPromise;
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
  (isDev ? 'http://localhost:5000' : '');

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
    const users = await fetchJsonWithCache('/api/users', {
      ttlMs: 60 * 1000,
      cacheKey: 'users:list',
    });
    return Array.isArray(users) ? users : [];
  } catch (error) {
    console.error('[fetchUsers] ❌ Error:', error);
    return [];
  }
}

async function fetchAdminOverview() {
  return fetchJsonWithCache('/api/admin/overview', {
    ttlMs: 20 * 1000,
    cacheKey: 'admin:overview',
  });
}

async function fetchAdminUserInfo(userId) {
  const cacheKey = `admin:user:${encodeURIComponent(userId)}`;
  const cached = readApiCache(cacheKey, 20 * 1000);
  if (cached !== null) return cached;

  const response = await fetchWithNotFoundFallback(`/api/admin/users/${encodeURIComponent(userId)}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || 'Failed to fetch user details');
  }

  writeApiCache(cacheKey, payload);

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

  invalidateApiCache(['admin:overview', `admin:user:${encodeURIComponent(userId)}`, 'users:list']);

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

  invalidateApiCache(['admin:overview', `admin:user:${encodeURIComponent(userId)}`, 'users:list']);

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
    invalidateApiCache(['signatures:']);
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
    const cacheKey = `signatures:${userRole}:${query}`;
    console.log('[fetchSignatures] Fetching from:', url);

    const responseData = await fetchJsonWithCache(url, {
      ttlMs: 60 * 1000,
      cacheKey,
    });
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
    invalidateApiCache(['signatures:']);
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
    invalidateApiCache(['assets:']);
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
    const cacheKey = `assets:${userRole}:${query}`;
    console.log('[fetchAssets] Fetching from:', url);

    const responseData = await fetchJsonWithCache(url, {
      ttlMs: 60 * 1000,
      cacheKey,
    });
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
    invalidateApiCache(['assets:']);
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
    invalidateApiCache(['documents:']);
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
    invalidateApiCache(['owner-documents:', 'documents:', 'notary:dashboard']);
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
    const cacheKey = `documents:${query}`;
    console.log('[fetchDocuments] Fetching from:', url);

    const responseData = await fetchJsonWithCache(url, {
      ttlMs: 45 * 1000,
      cacheKey,
    });
    console.log('[fetchDocuments] ✅ Got', responseData.length, 'documents');
    return responseData;
  } catch (error) {
    console.error('[fetchDocuments] ❌ Error:', error);
    return [];
  }
}

async function fetchOwnerDocuments({ ownerId, sessionId, inProcess, notarized, bypassCache = false } = {}) {
  try {
    const params = new URLSearchParams();
    if (ownerId) params.append('ownerId', ownerId);
    if (sessionId) params.append('sessionId', sessionId);
    if (inProcess !== undefined) params.append('inProcess', inProcess ? '1' : '0');
    if (notarized !== undefined) params.append('notarized', notarized ? '1' : '0');

    const query = params.toString() ? `?${params.toString()}` : '';
    const url = `/api/signer-documents${query}`;
    const cacheKey = `owner-documents:${query}`;
    console.log('[fetchOwnerDocuments] Fetching from:', url);

    const responseData = await fetchJsonWithCache(url, {
      ttlMs: 30 * 1000,
      cacheKey,
      bypassCache,
    });
    console.log('[fetchOwnerDocuments] ✅ Got', responseData.length, 'documents');
    return responseData;
  } catch (error) {
    console.error('[fetchOwnerDocuments] ❌ Error:', error);
    return [];
  }
}

const toOwnerDocumentSummary = (doc = {}) => ({
  id: doc.id,
  name: doc.name,
  documentName: doc.documentName,
  ownerId: doc.ownerId,
  ownerName: doc.ownerName,
  notaryName: doc.notaryName,
  notaryUserId: doc.notaryUserId,
  notaryReview: doc.notaryReview,
  status: doc.status,
  sessionId: doc.sessionId,
  scheduledAt: doc.scheduledAt,
  uploadedAt: doc.uploadedAt,
  updatedAt: doc.updatedAt,
  startedAt: doc.startedAt,
  endedAt: doc.endedAt,
  completedAt: doc.completedAt,
  notarizedAt: doc.notarizedAt,
  startTime: doc.startTime,
  endTime: doc.endTime,
  startedDate: doc.startedDate,
  paymentStatus: doc.paymentStatus,
  sessionAmount: doc.sessionAmount,
});

async function fetchOwnerDocumentsSummary({ ownerId, sessionId, inProcess, notarized, bypassCache = false } = {}) {
  try {
    const params = new URLSearchParams();
    if (ownerId) params.append('ownerId', ownerId);
    if (sessionId) params.append('sessionId', sessionId);
    if (inProcess !== undefined) params.append('inProcess', inProcess ? '1' : '0');
    if (notarized !== undefined) params.append('notarized', notarized ? '1' : '0');

    const query = params.toString() ? `?${params.toString()}` : '';
    const url = `/api/signer-documents${query}`;
    const cacheKey = `owner-documents-summary:${query}`;

    if (!bypassCache) {
      const cached = readApiCache(cacheKey, 30 * 1000);
      if (Array.isArray(cached)) {
        return cached;
      }
    }

    const response = await fetchWithFallback(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch signer documents`);
    }

    const responseData = await response.json();
    const summary = Array.isArray(responseData)
      ? responseData.map((doc) => toOwnerDocumentSummary(doc))
      : [];

    writeApiCache(cacheKey, summary);
    return summary;
  } catch (error) {
    console.error('[fetchOwnerDocumentsSummary] ❌ Error:', error);
    return [];
  }
}
  invalidateApiCache(['owner-documents:', 'owner-documents-summary:', 'documents:', 'notary:dashboard']);

async function fetchNotarizedDocuments({ sessionId, ownerId } = {}) {
  try {
    const params = new URLSearchParams();
    if (sessionId) params.append('sessionId', sessionId);
    if (ownerId) params.append('ownerId', ownerId);

    const query = params.toString() ? `?${params.toString()}` : '';
    const url = `/api/documents/notarized${query}`;
    const cacheKey = `documents:notarized:${query}`;
    console.log('[fetchNotarizedDocuments] Fetching from:', url);

    const responseData = await fetchJsonWithCache(url, {
      ttlMs: 45 * 1000,
      cacheKey,
    });
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
    invalidateApiCache(['documents:', 'owner-documents:', 'documents:notarized:', 'notary:dashboard']);
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
    invalidateApiCache(['owner-documents:', 'documents:', 'documents:notarized:', 'notary:dashboard']);
      invalidateApiCache(['owner-documents:', 'owner-documents-summary:', 'documents:', 'documents:notarized:', 'notary:dashboard']);
      invalidateApiCache(['owner-documents:', 'owner-documents-summary:', 'documents:', 'documents:notarized:', 'notary:dashboard']);
      invalidateApiCache(['owner-documents:', 'owner-documents-summary:', 'documents:', 'notary:dashboard']);
      invalidateApiCache(['owner-documents:', 'owner-documents-summary:', 'documents:', 'documents:notarized:', 'notary:dashboard']);
      invalidateApiCache(['owner-documents:', 'owner-documents-summary:', 'documents:', 'notary:dashboard']);
      invalidateApiCache(['owner-documents:', 'owner-documents-summary:', 'documents:', 'documents:notarized:', 'notary:dashboard']);
      invalidateApiCache(['owner-documents:', 'owner-documents-summary:', 'documents:', 'notary:dashboard']);
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
    invalidateApiCache(['owner-documents:', 'documents:', 'documents:notarized:', 'notary:dashboard']);
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
    invalidateApiCache(['owner-documents:', 'documents:', 'notary:dashboard']);
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
    invalidateApiCache(['owner-documents:', 'documents:', 'documents:notarized:', 'notary:dashboard']);
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

    invalidateApiCache(['owner-documents:', 'documents:', 'notary:dashboard']);

    return result;
  } catch (error) {
    console.error('[payOwnerDocumentSession] ❌ Error:', error);
    throw error;
  }
}

async function notarizeOwnerDocument(documentId) {
  try {
    const url = `/api/signer-documents/${encodeURIComponent(documentId)}/signer-notarize`;
    console.log('[notarizeOwnerDocument] Notarizing:', documentId);

    // Use fetchWithFallback (single attempt) instead of fetchWithNotFoundFallback (tries all bases)
    // to avoid 429 rate limiting from multiple concurrent requests
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
    invalidateApiCache(['owner-documents:', 'documents:', 'documents:notarized:', 'notary:dashboard']);
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
    invalidateApiCache(['owner-documents:', 'documents:', 'notary:dashboard']);
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
  invalidateApiCache(['kba:status', 'kba:queue']);
  return responsePayload;
}

async function fetchKbaStatus() {
  return fetchJsonWithCache('/api/kba/status', {
    ttlMs: 20 * 1000,
    cacheKey: 'kba:status',
  });
}

async function cancelKba() {
  const response = await fetchWithFallback('/api/kba/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to cancel KBA');
  invalidateApiCache(['kba:status', 'kba:queue']);
  return payload;
}

async function fetchPendingKbaQueue() {
  return fetchJsonWithCache('/api/admin/kba/pending', {
    ttlMs: 20 * 1000,
    cacheKey: 'kba:queue',
  });
}

async function approveKbaSubmission(userId) {
  const response = await fetchWithFallback(`/api/admin/kba/${userId}/approve`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to approve KBA submission');
  invalidateApiCache(['kba:status', 'kba:queue']);
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
  invalidateApiCache(['kba:status', 'kba:queue']);
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
  return fetchJsonWithCache('/api/debug/kba-submissions', {
    ttlMs: 15 * 1000,
    cacheKey: 'debug:kba-submissions',
  });
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
  invalidateApiCache(['owner-documents:', 'owner-documents-summary:', 'documents:', 'notary:dashboard']);
  return responseData;
}

async function fetchNotaryDashboardStats() {
  try {
    const responseData = await fetchJsonWithCache('/api/notary/dashboard/stats', {
      method: 'GET',
      ttlMs: DASHBOARD_CACHE_TTL_MS,
      cacheKey: 'notary:dashboard:stats',
      headers: {
        'Content-Type': 'application/json',
      },
    });
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

  invalidateApiCache(['recordings:']);

  return payload;
}

async function fetchSessionRecordings({ sessionId, status, provider } = {}) {
  const params = new URLSearchParams();
  if (sessionId) params.append('sessionId', sessionId);
  if (status) params.append('status', status);
  if (provider) params.append('provider', provider);

  const query = params.toString() ? `?${params.toString()}` : '';
  const url = `/api/recordings${query}`;
  const payload = await fetchJsonWithCache(url, {
    method: 'GET',
    ttlMs: 20 * 1000,
    cacheKey: `recordings:${query}`,
  });

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
  fetchOwnerDocumentsSummary,
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

