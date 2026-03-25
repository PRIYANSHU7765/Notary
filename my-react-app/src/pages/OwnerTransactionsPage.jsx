import React, { useEffect, useMemo, useState } from 'react';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import { fetchOwnerDocuments } from '../utils/apiClient';
import './NotaryWorkspacePages.css';

const normalize = (value) => String(value || '').trim().toLowerCase();

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const OwnerTransactionsPage = () => {
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

  const paidTransactions = useMemo(() => {
    return documents
      .filter((doc) => normalize(doc.paymentStatus) === 'paid')
      .sort((a, b) => {
        const aTime = new Date(a.paidAt || a.updatedAt || a.notarizedAt || 0).getTime();
        const bTime = new Date(b.paidAt || b.updatedAt || b.notarizedAt || 0).getTime();
        return bTime - aTime;
      });
  }, [documents]);

  const totalPaidAmount = useMemo(() => {
    return paidTransactions.reduce((sum, doc) => sum + Number(doc.sessionAmount || doc.amountPaid || 0), 0);
  }, [paidTransactions]);

  return (
    <NotaryWorkspaceShell
      sidebarRole="owner"
      title="Transactions"
      subtitle="All documents for which your payment is completed"
    >
      <div className="page-stack">
        <section className="notary-card">
          <div className="notary-card-body">
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))' }}>
              <div className="kpi-item">
                <p className="kpi-label">Paid Documents</p>
                <p className="kpi-value small">{paidTransactions.length}</p>
              </div>
              <div className="kpi-item">
                <p className="kpi-label">Total Paid</p>
                <p className="kpi-value small">{formatCurrency(totalPaidAmount)}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="notary-card">
          <div className="notary-card-header">Paid Documents</div>
          <div className="notary-card-body notary-table-wrap">
            {loading ? <p className="muted">Loading transactions...</p> : null}
            {!loading && error ? <p className="muted">{error}</p> : null}
            {!loading && !error && paidTransactions.length === 0 ? (
              <div className="empty-block">No paid documents found yet.</div>
            ) : null}

            {!loading && !error && paidTransactions.length > 0 ? (
              <table className="notary-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Notary</th>
                    <th>Session ID</th>
                    <th>Amount</th>
                    <th>Paid On</th>
                  </tr>
                </thead>
                <tbody>
                  {paidTransactions.map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.name || doc.documentName || '-'}</td>
                      <td>{doc.notaryName || '-'}</td>
                      <td>{doc.sessionId || '-'}</td>
                      <td>{formatCurrency(doc.sessionAmount || doc.amountPaid || 0)}</td>
                      <td>{formatDate(doc.paidAt || doc.updatedAt || doc.notarizedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </section>
      </div>
    </NotaryWorkspaceShell>
  );
};

export default OwnerTransactionsPage;
