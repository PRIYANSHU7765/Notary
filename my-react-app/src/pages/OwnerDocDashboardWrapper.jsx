import React, { useState } from 'react';
import NotaryWorkspaceShell from '../components/NotaryWorkspaceShell';
import OwnerDashboardPage from './OwnerDashboardPage';

const OwnerDocDashboardWrapper = () => {
  const [hideSidebar, setHideSidebar] = useState(false);

  return (
    <NotaryWorkspaceShell
      sidebarRole="owner"
      title="My Documents"
      subtitle="Manage and track all your notarization documents"
      hideSidebar={hideSidebar}
    >
      <OwnerDashboardPage setHideSidebar={setHideSidebar} />
    </NotaryWorkspaceShell>
  );
};

export default OwnerDocDashboardWrapper;
