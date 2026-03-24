import React, { useEffect, useMemo, useState } from 'react';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import { fetchNotaryDashboardStats } from '../utils/apiClient';
import './NotaryWorkspacePages.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));

const NotaryDashboardPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({});

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetchNotaryDashboardStats();
        const data = response?.data || response || {};
        if (!active) return;
        setStats(data);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Failed to load dashboard data');
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
    const tx = Array.isArray(stats.transactions) ? stats.transactions : [];
    const paid = tx.filter((t) => String(t.paymentStatus || '').toLowerCase() === 'paid').length;
    return {
      totalCalls: Number(stats.totalCompletedCalls || 0),
      payout: Number(stats.availableForPayout || 0),
      scheduledMeetings: Number(stats.scheduledCalls || 0),
      onDemandCalls: Number(stats.onDemandCalls || 0),
      totalTransactions: tx.length,
      paidTransactions: paid,
    };
  }, [stats]);

  return (
    <NotaryWorkspaceShell
      title="Home"
      subtitle="Overview of your notary activity, payout, and scheduling performance"
    >
      <div className="page-stack">
        <section className="notary-card">
          <div className="notary-card-header">Key Stats</div>
          <div className="notary-card-body">
            {loading ? <p className="muted">Loading stats...</p> : null}
            {!loading && error ? <p className="muted">{error}</p> : null}

            {!loading && !error ? (
              <div className="kpi-grid">
                <div className="kpi-item">
                  <p className="kpi-label">Total Calls</p>
                  <p className="kpi-value">{summary.totalCalls}</p>
                </div>
                <div className="kpi-item">
                  <p className="kpi-label">Available for Payout</p>
                  <p className="kpi-value small">{formatCurrency(summary.payout)}</p>
                </div>
                <div className="kpi-item">
                  <p className="kpi-label">Scheduled Meetings</p>
                  <p className="kpi-value">{summary.scheduledMeetings}</p>
                </div>
                <div className="kpi-item">
                  <p className="kpi-label">On demand Calls</p>
                  <p className="kpi-value">{summary.onDemandCalls}</p>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="section-grid">
          <article className="notary-card">
            <div className="notary-card-header">Transaction Snapshot</div>
            <div className="notary-card-body">
              <p className="kpi-label">Total Transactions</p>
              <p className="kpi-value small">{summary.totalTransactions}</p>
              <p className="muted">Paid Transactions: {summary.paidTransactions}</p>
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

export default NotaryDashboardPage;
