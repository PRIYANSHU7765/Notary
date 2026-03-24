import React, { useEffect, useMemo, useState } from 'react';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import { fetchNotaryDashboardStats } from '../utils/apiClient';
import './NotaryWorkspacePages.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const NotaryTransactionsPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const response = await fetchNotaryDashboardStats();
        const data = response?.data || response || {};
        if (!active) return;
        setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load transactions');
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
    const paidCount = transactions.filter((t) => String(t.paymentStatus).toLowerCase() === 'paid').length;
    const pendingCount = transactions.length - paidCount;
    const totalAmount = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    return { paidCount, pendingCount, totalAmount };
  }, [transactions]);

  return (
    <NotaryWorkspaceShell
      title="Transactions"
      subtitle="Review all completed and pending transaction records"
    >
      <div className="page-stack">
        <section className="notary-card">
          <div className="notary-card-body">
            <div className="kpi-grid">
              <div className="kpi-item">
                <p className="kpi-label">Total Transactions</p>
                <p className="kpi-value small">{transactions.length}</p>
              </div>
              <div className="kpi-item">
                <p className="kpi-label">Paid</p>
                <p className="kpi-value small">{summary.paidCount}</p>
              </div>
              <div className="kpi-item">
                <p className="kpi-label">Pending</p>
                <p className="kpi-value small">{summary.pendingCount}</p>
              </div>
              <div className="kpi-item">
                <p className="kpi-label">Total Amount</p>
                <p className="kpi-value small">{formatCurrency(summary.totalAmount)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="notary-card">
          <div className="notary-card-header">All Transactions</div>
          <div className="notary-card-body notary-table-wrap">
            {loading ? <p className="muted">Loading transactions...</p> : null}
            {!loading && error ? <p className="muted">{error}</p> : null}
            {!loading && !error && transactions.length === 0 ? <div className="empty-block">No transactions available.</div> : null}

            {!loading && !error && transactions.length > 0 ? (
              <table className="notary-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Owner</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => {
                    const paymentStatus = String(transaction.paymentStatus || 'pending').toLowerCase();
                    return (
                      <tr key={transaction.id}>
                        <td>{transaction.documentName || '-'}</td>
                        <td>{transaction.ownerName || '-'}</td>
                        <td>{formatCurrency(transaction.amount)}</td>
                        <td>{transaction.status || '-'}</td>
                        <td>
                          <span className={`status-chip ${paymentStatus === 'paid' ? 'paid' : 'pending'}`}>
                            {paymentStatus}
                          </span>
                        </td>
                        <td>{formatDate(transaction.date)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
        </section>
      </div>
    </NotaryWorkspaceShell>
  );
};

export default NotaryTransactionsPage;
