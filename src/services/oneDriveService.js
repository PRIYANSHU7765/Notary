/**
 * OneDrive Service
 * Handles file upload and sharing to Microsoft OneDrive
 */

const {
  ONEDRIVE_TENANT_ID,
  ONEDRIVE_CLIENT_ID,
  ONEDRIVE_CLIENT_SECRET,
  ONEDRIVE_DRIVE_ID,
  ONEDRIVE_USER_ID,
  ONEDRIVE_FOLDER_PATH,
  ONEDRIVE_SHARE_SCOPE,
} = require('../utils/env');
const { sanitizeFileName } = require('../utils/file');

function isOneDriveConfigured() {
  return Boolean(
    ONEDRIVE_TENANT_ID &&
      ONEDRIVE_CLIENT_ID &&
      ONEDRIVE_CLIENT_SECRET &&
      (ONEDRIVE_DRIVE_ID || ONEDRIVE_USER_ID)
  );
}

async function getOneDriveAccessToken() {
  if (!isOneDriveConfigured()) {
    throw new Error('OneDrive is not configured on this server');
  }

  const tokenEndpoint = `https://login.microsoftonline.com/${encodeURIComponent(ONEDRIVE_TENANT_ID)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: ONEDRIVE_CLIENT_ID,
    client_secret: ONEDRIVE_CLIENT_SECRET,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description || payload?.error || `Failed to fetch OneDrive access token (HTTP ${response.status})`
    );
  }

  return payload.access_token;
}

function buildOneDriveUploadUrl(encodedPath) {
  if (ONEDRIVE_DRIVE_ID) {
    return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(ONEDRIVE_DRIVE_ID)}/root:/${encodedPath}:/content`;
  }
  return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER_ID)}/drive/root:/${encodedPath}:/content`;
}

async function createOneDriveShareLink(itemId, accessToken) {
  const scope = ONEDRIVE_SHARE_SCOPE === 'anonymous' ? 'anonymous' : 'organization';
  const endpoint = ONEDRIVE_DRIVE_ID
    ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(ONEDRIVE_DRIVE_ID)}/items/${encodeURIComponent(itemId)}/createLink`
    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER_ID)}/drive/items/${encodeURIComponent(itemId)}/createLink`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'view', scope }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Failed to create OneDrive share link (HTTP ${response.status})`);
  }

  return payload?.link?.webUrl || '';
}

async function uploadRecordingToOneDrive({ fileBuffer, fileName, mimeType, sessionId }) {
  const accessToken = await getOneDriveAccessToken();

  const safeSession = sanitizeFileName(sessionId || 'session-unknown');
  const safeFileName = sanitizeFileName(fileName || `recording-${Date.now()}.webm`);
  const folderPath = ONEDRIVE_FOLDER_PATH.replace(/^\/+|\/+$/g, '');
  const fullPath = `${folderPath}/${safeSession}/${Date.now()}-${safeFileName}`;
  const encodedPath = fullPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const uploadUrl = buildOneDriveUploadUrl(encodedPath);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': mimeType || 'video/webm',
    },
    body: fileBuffer,
  });

  const uploadPayload = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok) {
    throw new Error(
      uploadPayload?.error?.message || `OneDrive upload failed (HTTP ${uploadResponse.status})`
    );
  }

  let shareUrl = '';
  if (uploadPayload?.id) {
    try {
      shareUrl = await createOneDriveShareLink(uploadPayload.id, accessToken);
    } catch (err) {
      console.warn('⚠️ Failed to create share link:', err.message);
    }
  }

  return {
    provider: 'onedrive',
    providerFileId: uploadPayload?.id || null,
    providerUrl: uploadPayload?.webUrl || null,
    shareUrl: shareUrl || null,
    sizeBytes: Number(uploadPayload?.size || fileBuffer.length || 0),
  };
}

module.exports = {
  isOneDriveConfigured,
  getOneDriveAccessToken,
  buildOneDriveUploadUrl,
  createOneDriveShareLink,
  uploadRecordingToOneDrive,
};
