import { useAuth } from '@renderer/context/AuthContext';
import { AdminRbacSummary } from '../../../shared/types';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type AdminTab = 'roles' | 'permissions';

function AdminPanel(): React.JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('roles');
  const [summary, setSummary] = useState<AdminRbacSummary | null>(null);

  useEffect(() => {
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
      const nextSummary = await window.api.getAdminRbacSummary();
      if (!cancelled) {
        setSummary(nextSummary);
      }
    };

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [navigate, user]);

  if (!user || user.roleId !== 1) {
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

      <div className="profile-tabs" role="tablist" aria-label="Admin sections">
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
      </div>

      {activeTab === 'roles' ? (
        <div className="admin-roles-grid">
          {(summary?.roles ?? []).map((role) => (
            <article key={role.id} className="admin-role-card">
              <div className="admin-role-head">
                <h3>{role.name}</h3>
                <span>{role.usersCount} users</span>
              </div>
              <div className="permission-chips">
                {role.permissions.slice(0, 6).map((permission) => (
                  <span key={permission}>{permission}</span>
                ))}
                {role.permissions.length > 6 ? (
                  <span>+{role.permissions.length - 6} more</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {activeTab === 'permissions' ? (
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
