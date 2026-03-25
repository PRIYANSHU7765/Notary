import React from 'react';
import NotarySidebar from './NotarySidebar';
import './NotaryWorkspaceShell.css';

const NotaryWorkspaceShell = ({
  title,
  subtitle,
  actions = null,
  children,
  sidebarRole = 'notary',
  customMenuItems,
}) => {
  return (
    <div className="notary-workspace-layout">
      <NotarySidebar role={sidebarRole} menuItems={customMenuItems} />
      <div className="notary-workspace-main">
        <header className="notary-workspace-header">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="notary-workspace-actions">{actions}</div> : null}
        </header>
        <main className="notary-workspace-content">{children}</main>
      </div>
    </div>
  );
};

export default NotaryWorkspaceShell;
