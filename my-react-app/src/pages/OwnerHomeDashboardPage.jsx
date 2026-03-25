import React, { useEffect, useMemo, useState } from 'react';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import { fetchOwnerDocuments } from '../utils/apiClient';
import './NotaryWorkspacePages.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));

const normalize = (value) => String(value || '').trim().toLowerCase();

const OwnerHomeDashboardPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetchOwnerDocuments({});
        if (!active) return;
        setDocuments(Array.isArray(response) ? response : []);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Failed to load owner dashboard data');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => {
    const paidTransactions = documents.filter((doc) => normalize(doc.paymentStatus) === 'paid');
    const totalPaidAmount = paidTransactions.reduce(
      (sum, doc) => sum + Number(doc.sessionAmount || doc.amountPaid || 0),
      0
    );

    const scheduledMeetings = documents.filter((doc) => {
      if (!doc.scheduledAt) return false;
      const status = normalize(doc.status || doc.notaryReview);
      return status !== 'rejected';
    }).length;

    return {
      totalCalls: documents.length,
      totalTransactions: paidTransactions.length,
      paidTransactions: paidTransactions.length,
      totalPaidAmount,
      scheduledMeetings,
    };
  }, [documents]);

  return (
    <NotaryWorkspaceShell
      sidebarRole="owner"
      title="Home"
      subtitle="Overview of your document activity, payments, and scheduled meetings"
    >
      <div className="page-stack">
        <section className="notary-card">
          <div className="notary-card-header">Key Stats</div>
          <div className="notary-card-body">
            {loading ? <p className="muted">Loading stats...</p> : null}
            {!loading && error ? <p className="muted">{error}</p> : null}

            {!loading && !error ? (
              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(180px, 1fr))' }}>
                <div className="kpi-item">
                  <p className="kpi-label">Total Calls</p>
                  <p className="kpi-value">{summary.totalCalls}</p>
                </div>
                <div className="kpi-item">
                  <p className="kpi-label">Total Paid</p>
                  <p className="kpi-value small">{formatCurrency(summary.totalPaidAmount)}</p>
                </div>
                <div className="kpi-item">
                  <p className="kpi-label">Scheduled Meetings</p>
                  <p className="kpi-value">{summary.scheduledMeetings}</p>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="section-grid">
          <article className="notary-card">
            <div className="notary-card-header">Transaction Snapshot</div>
            <div className="notary-card-body">
              <p className="kpi-label">Paid Transactions</p>
              <p className="kpi-value small">{summary.totalTransactions}</p>
              <p className="muted">Total Paid Amount: {formatCurrency(summary.totalPaidAmount)}</p>
            </div>
          </article>

          <article className="notary-card">
            <div className="notary-card-header">Schedule Snapshot</div>
            <div className="notary-card-body">
              <p className="kpi-label">Scheduled Meetings</p>
              <p className="kpi-value small">{summary.scheduledMeetings}</p>
              <p className="muted">Use Meetings to view current, upcoming, and past sessions.</p>
            </div>
          </article>
        </section>
      </div>
    </NotaryWorkspaceShell>
  );
};

export default OwnerHomeDashboardPage;
