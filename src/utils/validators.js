/**
 * Validation Utilities
 * Email, KBA, and general data validation
 */

const isValidEmailAddress = (value) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
};

const isKbaApprovedStatus = (value) => {
  const KBA_STATUS = {
    DRAFT: 'draft',
    OTP_PENDING: 'otp_pending',
    OTP_VERIFIED: 'otp_verified',
    PENDING_REVIEW: 'kba_pending_review',
    APPROVED: 'kba_approved',
    REJECTED: 'kba_rejected',
  };
  return String(value || '').trim().toLowerCase() === KBA_STATUS.APPROVED;
};

const shouldRequireKbaForRole = (role) => {
  return ['signer', 'notary'].includes(String(role || '').trim().toLowerCase());
};

module.exports = {
  isValidEmailAddress,
  isKbaApprovedStatus,
  shouldRequireKbaForRole,
};
