import { useAuth } from '@renderer/context/AuthContext';
import { AdminAccessData, AdminAuditEntry, AdminRbacSummary } from '../../../shared/types';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type AdminTab = 'roles' | 'permissions' | 'users' | 'audit';

function equalNumberSets(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);

  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function AdminPanel(): React.JSX.Element {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('roles');
  const [summary, setSummary] = useState<AdminRbacSummary | null>(null);
  const [accessData, setAccessData] = useState<AdminAccessData | null>(null);
  const [pendingRoleByUserId, setPendingRoleByUserId] = useState<Record<number, number>>({});
  const [pendingPermissionsByRoleId, setPendingPermissionsByRoleId] = useState<
    Record<number, number[]>
  >({});
  const [newRoleName, setNewRoleName] = useState('');
  const [newPermissionAction, setNewPermissionAction] = useState('');
  const [newPermissionDescription, setNewPermissionDescription] = useState('');
  const [auditLog, setAuditLog] = useState<AdminAuditEntry[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSavingRole, setIsSavingRole] = useState<number | null>(null);
  const [isSavingRolePermissions, setIsSavingRolePermissions] = useState<number | null>(null);
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [isCreatingPermission, setIsCreatingPermission] = useState(false);
  const [isDeletingRole, setIsDeletingRole] = useState<number | null>(null);
  const [isDeletingPermission, setIsDeletingPermission] = useState<number | null>(null);

  const loadAdminData = async () => {
    const [nextSummary, nextAccessData] = await Promise.all([
      window.api.getAdminRbacSummary(),
      window.api.getAdminAccessData()
    ]);

    setSummary(nextSummary);
    setAccessData(nextAccessData);
    setPendingRoleByUserId(
      nextAccessData.users.reduce<Record<number, number>>((acc, nextUser) => {
        acc[nextUser.id] = nextUser.roleId;
        return acc;
      }, {})
    );
    setPendingPermissionsByRoleId(
      nextAccessData.roles.reduce<Record<number, number[]>>((acc, role) => {
        acc[role.id] = role.permissionIds;
        return acc;
      }, {})
    );
  };

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!user) {
      navigate('/login');
      return;
    }

    if (user.roleId !== 1) {
      navigate('/library');
      return;
    }

    let cancelled = false;

    const loadSummary = async () => {
      await loadAdminData();

      if (!cancelled) {
        setStatusMessage(null);
      }
    };

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [isLoading, navigate, user]);

  const handleRoleSave = async (targetUserId: number) => {
    const nextRoleId = pendingRoleByUserId[targetUserId];

    if (!nextRoleId) {
      return;
    }

    setIsSavingRole(targetUserId);
    setStatusMessage(null);

    try {
      const result = await window.api.updateAdminUserRole(targetUserId, nextRoleId);

      if (!result.success) {
        setStatusMessage(result.error || 'Failed to update user role.');
        return;
      }

      await loadAdminData();
      setStatusMessage('User role updated.');
    } finally {
      setIsSavingRole(null);
    }
  };

  const handleTogglePermission = (roleId: number, permissionId: number) => {
    setPendingPermissionsByRoleId((current) => {
      const currentRolePermissions = current[roleId] ?? [];
      const nextRolePermissions = currentRolePermissions.includes(permissionId)
        ? currentRolePermissions.filter((value) => value !== permissionId)
        : [...currentRolePermissions, permissionId];

      return {
        ...current,
        [roleId]: nextRolePermissions
      };
    });
  };

  const handleSaveRolePermissions = async (roleId: number) => {
    const permissionIds = pendingPermissionsByRoleId[roleId] ?? [];
    setIsSavingRolePermissions(roleId);
    setStatusMessage(null);

    try {
      const result = await window.api.updateAdminRolePermissions(roleId, permissionIds);

      if (!result.success) {
        setStatusMessage(result.error || 'Failed to update role permissions.');
        return;
      }

      await loadAdminData();
      setStatusMessage('Role permissions updated.');
    } finally {
      setIsSavingRolePermissions(null);
    }
  };

  const handleCreateRole = async () => {
    const roleName = newRoleName.trim();

    if (!roleName) {
      setStatusMessage('Role name is required.');
      return;
    }

    setIsCreatingRole(true);
    setStatusMessage(null);

    try {
      const result = await window.api.createAdminRole(roleName);

      if (!result.success) {
        setStatusMessage(result.error || 'Failed to create role.');
        return;
      }

      setNewRoleName('');
      await loadAdminData();
      setStatusMessage('Role created.');
    } finally {
      setIsCreatingRole(false);
    }
  };

  const handleDeleteRole = async (roleId: number, roleName: string) => {
    const approved = window.confirm(`Delete role ${roleName}?`);
    if (!approved) {
      return;
    }

    setIsDeletingRole(roleId);
    setStatusMessage(null);

    try {
      const result = await window.api.deleteAdminRole(roleId);

      if (!result.success) {
        setStatusMessage(result.error || 'Failed to delete role.');
        return;
      }

      await loadAdminData();
      setStatusMessage('Role deleted.');
    } finally {
      setIsDeletingRole(null);
    }
  };

  const handleCreatePermission = async () => {
    const action = newPermissionAction.trim();

    if (!action) {
      setStatusMessage('Permission action is required.');
      return;
    }

    setIsCreatingPermission(true);
    setStatusMessage(null);

    try {
      const result = await window.api.createAdminPermission(
        action,
        newPermissionDescription.trim() || undefined
      );

      if (!result.success) {
        setStatusMessage(result.error || 'Failed to create permission.');
        return;
      }

      setNewPermissionAction('');
      setNewPermissionDescription('');
      await loadAdminData();
      setStatusMessage('Permission created.');
    } finally {
      setIsCreatingPermission(false);
    }
  };

  const handleDeletePermission = async (permissionId: number, action: string) => {
    const approved = window.confirm(`Delete permission ${action}?`);
    if (!approved) {
      return;
    }

    setIsDeletingPermission(permissionId);
    setStatusMessage(null);

    try {
      const result = await window.api.deleteAdminPermission(permissionId);

      if (!result.success) {
        setStatusMessage(result.error || 'Failed to delete permission.');
        return;
      }

      await loadAdminData();
      setStatusMessage('Permission deleted.');
    } finally {
      setIsDeletingPermission(null);
    }
  };

  const handleLoadAudit = async () => {
    setIsLoadingAudit(true);

    try {
      const entries = await window.api.getAdminAuditLog(120);
      setAuditLog(entries);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (!user || user.roleId !== 1 || activeTab !== 'audit') {
      return;
    }

    void handleLoadAudit();
  }, [activeTab, user]);

  if (isLoading || !user || user.roleId !== 1) {
    return <section className="admin-page" />;
  }

  return (
    <section className="admin-page">
      <div className="admin-hero">
        <div>
          <h2>Admin Panel</h2>
          <p>System role and permission management</p>
        </div>
        <div className="admin-hero-stats">
          <div>
            <strong>{summary?.rolesCount ?? 0}</strong>
            <span>Roles</span>
          </div>
          <div>
            <strong>{summary?.permissionsCount ?? 0}</strong>
            <span>Permissions</span>
          </div>
        </div>
      </div>

      <div className="profile-tabs admin-tabs" role="tablist" aria-label="Admin sections">
        <button
          type="button"
          role="tab"
          className={activeTab === 'roles' ? 'active' : ''}
          aria-selected={activeTab === 'roles'}
          onClick={() => setActiveTab('roles')}
        >
          Roles
        </button>
        <button
          type="button"
          role="tab"
          className={activeTab === 'permissions' ? 'active' : ''}
          aria-selected={activeTab === 'permissions'}
          onClick={() => setActiveTab('permissions')}
        >
          Permissions
        </button>
        <button
          type="button"
          role="tab"
          className={activeTab === 'users' ? 'active' : ''}
          aria-selected={activeTab === 'users'}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button
          type="button"
          role="tab"
          className={activeTab === 'audit' ? 'active' : ''}
          aria-selected={activeTab === 'audit'}
          onClick={() => setActiveTab('audit')}
        >
          Audit
        </button>
      </div>

      {statusMessage ? <p className="empty-state">{statusMessage}</p> : null}

      {activeTab === 'roles' ? (
        <>
          <div className="admin-section-actions">
            <div className="admin-form-inline">
              <input
                type="text"
                placeholder="New role name"
                value={newRoleName}
                onChange={(event) => setNewRoleName(event.target.value)}
              />
              <button
                type="button"
                className="quick-launch-button"
                disabled={isCreatingRole}
                onClick={handleCreateRole}
              >
                {isCreatingRole ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </div>

          <div className="admin-roles-grid">
            {(accessData?.roles ?? []).map((role) => {
              const nextPermissionIds = pendingPermissionsByRoleId[role.id] ?? role.permissionIds;
              const hasPermissionChanges = !equalNumberSets(nextPermissionIds, role.permissionIds);

              return (
                <article key={role.id} className="admin-role-card">
                  <div className="admin-role-head">
                    <h3>{role.name}</h3>
                    <span>{role.usersCount} users</span>
                  </div>

                  <div className="admin-role-permission-list">
                    {(accessData?.permissions ?? []).map((permission) => (
                      <label key={permission.id} className="admin-role-permission-item">
                        <input
                          type="checkbox"
                          checked={nextPermissionIds.includes(permission.id)}
                          onChange={() => handleTogglePermission(role.id, permission.id)}
                        />
                        <span>{permission.action}</span>
                      </label>
                    ))}
                  </div>

                  <div className="admin-role-actions">
                    <button
                      type="button"
                      className="quick-launch-button"
                      disabled={!hasPermissionChanges || isSavingRolePermissions === role.id}
                      onClick={() => handleSaveRolePermissions(role.id)}
                    >
                      {isSavingRolePermissions === role.id ? 'Saving...' : 'Save Permissions'}
                    </button>
                    <button
                      type="button"
                      className="quick-launch-button admin-danger"
                      disabled={role.name.toLowerCase() === 'admin' || isDeletingRole === role.id}
                      onClick={() => handleDeleteRole(role.id, role.name)}
                    >
                      {isDeletingRole === role.id ? 'Deleting...' : 'Delete Role'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}

      {activeTab === 'permissions' ? (
        <>
          <div className="admin-section-actions">
            <div className="admin-form-inline admin-form-stack">
              <input
                type="text"
                placeholder="Permission action (e.g. users.read)"
                value={newPermissionAction}
                onChange={(event) => setNewPermissionAction(event.target.value)}
              />
              <input
                type="text"
                placeholder="Description (optional)"
                value={newPermissionDescription}
                onChange={(event) => setNewPermissionDescription(event.target.value)}
              />
              <button
                type="button"
                className="quick-launch-button"
                disabled={isCreatingPermission}
                onClick={handleCreatePermission}
              >
                {isCreatingPermission ? 'Creating...' : 'Create Permission'}
              </button>
            </div>
          </div>

          <article className="profile-card">
            <h3>All System Permissions</h3>
            <div className="sessions-table-wrap">
              <table className="sessions-table permissions-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Action</th>
                    <th>Description</th>
                    <th>Used In Roles</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary?.permissions ?? []).map((permission) => (
                    <tr key={permission.id}>
                      <td>#{permission.id}</td>
                      <td>
                        <span className="permission-pill">{permission.action}</span>
                      </td>
                      <td>{permission.description || '-'}</td>
                      <td>
                        <div className="permission-chips compact">
                          {permission.usedInRoles.map((roleName) => (
                            <span key={roleName}>{roleName}</span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="quick-launch-button admin-danger"
                          disabled={
                            permission.action === 'admin.rbac' ||
                            isDeletingPermission === permission.id
                          }
                          onClick={() => handleDeletePermission(permission.id, permission.action)}
                        >
                          {isDeletingPermission === permission.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}

      {activeTab === 'users' ? (
        <article className="profile-card">
          <h3>User Role Assignment</h3>
          <div className="sessions-table-wrap">
            <table className="sessions-table permissions-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(accessData?.users ?? []).map((panelUser) => {
                  const pendingRoleId = pendingRoleByUserId[panelUser.id] ?? panelUser.roleId;
                  const isChanged = pendingRoleId !== panelUser.roleId;

                  return (
                    <tr key={panelUser.id}>
                      <td>#{panelUser.id}</td>
                      <td>{panelUser.username}</td>
                      <td>{panelUser.email}</td>
                      <td>
                        <select
                          value={pendingRoleId}
                          onChange={(event) =>
                            setPendingRoleByUserId((current) => ({
                              ...current,
                              [panelUser.id]: Number(event.target.value)
                            }))
                          }
                        >
                          {(accessData?.roles ?? []).map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="quick-launch-button"
                          disabled={!isChanged || isSavingRole === panelUser.id}
                          onClick={() => handleRoleSave(panelUser.id)}
                        >
                          {isSavingRole === panelUser.id ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {activeTab === 'audit' ? (
        <article className="profile-card">
          <div className="admin-role-head">
            <h3>Admin Audit Log</h3>
            <button
              type="button"
              className="quick-launch-button"
              disabled={isLoadingAudit}
              onClick={() => void handleLoadAudit()}
            >
              {isLoadingAudit ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="sessions-table-wrap">
            <table className="sessions-table permissions-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td>{entry.actorEmail}</td>
                    <td>{entry.action}</td>
                    <td>
                      {entry.targetId ? `${entry.targetType}:${entry.targetId}` : entry.targetType}
                    </td>
                    <td>{entry.details || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}

export default AdminPanel;
