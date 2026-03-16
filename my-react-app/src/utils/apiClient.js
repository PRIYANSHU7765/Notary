// API Client for backend communication
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const API_BASE_CANDIDATES = [
  configuredApiBaseUrl,
  'http://localhost:5001',
  'http://localhost:5002',
  'http://localhost:5000',
].filter(Boolean);

let lastWorkingApiBaseUrl = API_BASE_CANDIDATES[0];

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
      return response;
    } catch (error) {
      networkError = error;
    }
  }

  throw networkError || new Error('Unable to connect to backend server');
}

const API_BASE_URL = configuredApiBaseUrl || 'http://localhost:5001';

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

async function fetchSignatures(userRole) {
  try {
    const url = `/api/signatures/${userRole}`;
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

export { saveSignature, fetchSignatures, deleteSignature, registerUser, loginUser, API_BASE_URL };
