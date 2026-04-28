import { useAuth } from '@renderer/context/AuthContext';
import { ProfileDashboard } from '../../../shared/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_EVENTS, subscribeToAppEvents } from '../shared/appEvents';

type ProfileTab = 'overview' | 'games' | 'sessions';

const PROFILE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function ProfilePage(): React.JSX.Element {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [dashboard, setDashboard] = useState<ProfileDashboard | null>(null);

  // Стан для фільтрів дати
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const loadDashboard = async (userId: number) => {
    const nextDashboard = await window.api.getProfileDashboard(userId);
    setDashboard(nextDashboard);
  };

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!user) {
      navigate('/login');
      return;
    }

    let cancelled = false;

    const loadDashboardSafe = async () => {
      const nextDashboard = await window.api.getProfileDashboard(user.id);
      if (!cancelled) {
        setDashboard(nextDashboard);
      }
    };

    void loadDashboardSafe();

    return () => {
      cancelled = true;
    };
  }, [isLoading, navigate, user]);

  useEffect(() => {
    if (isLoading || !user) {
      return;
    }

    const refreshProfile = () => {
      void loadDashboard(user.id);
    };

    const unsubscribe = subscribeToAppEvents([APP_EVENTS.SESSION_UPDATED], refreshProfile);
    window.addEventListener('focus', refreshProfile);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', refreshProfile);
    };
  }, [isLoading, user]);

  useEffect(() => {
    if (isLoading || !user || activeTab !== 'sessions') {
      return;
    }

    const interval = setInterval(() => {
      void loadDashboard(user.id);
    }, 12000);

    return () => {
      clearInterval(interval);
    };
  }, [activeTab, isLoading, user]);

  const topGames = useMemo(() => {
    if (!dashboard?.byGame?.length) {
      return [];
    }

    return [...dashboard.byGame]
      .sort((left, right) => right.totalMinutes - left.totalMinutes)
      .slice(0, 5);
  }, [dashboard]);

  const pieGradient = useMemo(() => {
    if (!topGames.length) {
      return 'conic-gradient(#2f2f2f 0deg 360deg)';
    }

    const totalMinutes = topGames.reduce((sum, item) => sum + item.totalMinutes, 0);
    let currentOffset = 0;
    const slices = topGames.map((item, index) => {
      const degrees = totalMinutes ? (item.totalMinutes / totalMinutes) * 360 : 0;
      const start = currentOffset;
      const end = currentOffset + degrees;
      currentOffset = end;
      return `${PROFILE_COLORS[index % PROFILE_COLORS.length]} ${start}deg ${end}deg`;
    });

    return `conic-gradient(${slices.join(', ')})`;
  }, [topGames]);

  // Логіка фільтрації сесій
  const filteredSessions = useMemo(() => {
    if (!dashboard?.sessionHistory) return [];

    return dashboard.sessionHistory.filter((session) => {
      const sessionDate = new Date(session.startedAt);
      const sessionTime = new Date(
        sessionDate.getFullYear(),
        sessionDate.getMonth(),
        sessionDate.getDate()
      ).getTime();

      let isValid = true;

      if (startDate) {
        const start = new Date(startDate);
        const startMs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
        if (sessionTime < startMs) isValid = false;
      }

      if (endDate) {
        const end = new Date(endDate);
        const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
        if (sessionTime > endMs) isValid = false;
      }

      return isValid;
    });
  }, [dashboard?.sessionHistory, startDate, endDate]);

  if (!user) {
    return <section className="profile-page" />;
  }

  return (
    <section className="profile-page">
      <div className="profile-hero">
        <div className="profile-avatar">{user.username.slice(0, 2).toUpperCase()}</div>
        <div className="profile-meta">
          <h2>{user.username}</h2>
          <p>Member since {new Date(user.createdAt || Date.now()).toLocaleDateString('en-US')}</p>
        </div>
        <div className="profile-stats">
          <div>
            <strong>{dashboard?.sessions ?? 0}</strong>
            <span>Sessions</span>
          </div>
          <div>
            <strong>{formatDuration(dashboard?.totalMinutes ?? 0)}</strong>
            <span>Total Time</span>
          </div>
          <div>
            <strong>{dashboard?.averageMinutes ?? 0}m</strong>
            <span>Avg Session</span>
          </div>
        </div>
      </div>

      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        <button
          type="button"
          role="tab"
          className={activeTab === 'overview' ? 'active' : ''}
          aria-selected={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          className={activeTab === 'games' ? 'active' : ''}
          aria-selected={activeTab === 'games'}
          onClick={() => setActiveTab('games')}
        >
          Games
        </button>
        <button
          type="button"
          role="tab"
          className={activeTab === 'sessions' ? 'active' : ''}
          aria-selected={activeTab === 'sessions'}
          onClick={() => setActiveTab('sessions')}
        >
          Sessions
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div className="profile-grid two-columns">
          <article className="profile-card">
            <h3>Daily Activity</h3>
            {dashboard?.recentActivity?.length ? (
              <div className="simple-line-chart">
                {dashboard.recentActivity.map((point) => {
                  const max = Math.max(
                    ...dashboard.recentActivity.map((entry) => entry.minutes),
                    1
                  );
                  const height = `${Math.max(6, (point.minutes / max) * 100)}%`;
                  return (
                    <div
                      key={point.label}
                      className="line-chart-point"
                      title={`${point.label}: ${point.minutes}m`}
                    >
                      <span style={{ height }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty-state">No sessions yet.</p>
            )}
          </article>

          <article className="profile-card">
            <h3>Session Duration</h3>
            {dashboard?.durationBuckets?.length ? (
              <div className="simple-bar-chart">
                {dashboard.durationBuckets.map((bucket) => (
                  <div key={bucket.label} className="bar-chart-row">
                    <label>{bucket.label}</label>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${Math.max(
                            6,
                            (bucket.count /
                              Math.max(
                                ...dashboard.durationBuckets.map((entry) => entry.count),
                                1
                              )) *
                              100
                          )}%`
                        }}
                      />
                    </div>
                    <span>{bucket.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No sessions yet.</p>
            )}
          </article>
        </div>
      ) : null}

      {activeTab === 'games' ? (
        <div className="profile-grid two-columns">
          <article className="profile-card">
            <h3>Game Distribution</h3>
            <div className="pie-wrap">
              <div className="pie-chart" style={{ background: pieGradient }} />
              <ul className="pie-legend">
                {topGames.map((entry, index) => (
                  <li key={entry.gameTitle}>
                    <i style={{ backgroundColor: PROFILE_COLORS[index % PROFILE_COLORS.length] }} />
                    <span>{entry.gameTitle}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className="profile-card">
            <h3>Game Statistics</h3>
            <ul className="game-stats-list">
              {topGames.map((entry) => (
                <li key={entry.gameTitle}>
                  <span>{entry.gameTitle}</span>
                  <strong>{formatDuration(entry.totalMinutes)}</strong>
                  <small>{entry.sessions} sessions</small>
                </li>
              ))}
            </ul>
          </article>
        </div>
      ) : null}

      {activeTab === 'sessions' ? (
        <article className="profile-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}
          >
            <h3 style={{ margin: 0 }}>Session History</h3>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <label
                style={{ display: 'flex', gap: '6px', fontSize: '13px', alignItems: 'center' }}
              >
                Since:
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    background: '#262b39',
                    border: '1px solid #30384a',
                    color: '#fff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '13px'
                  }}
                />
              </label>
              <label
                style={{ display: 'flex', gap: '6px', fontSize: '13px', alignItems: 'center' }}
              >
                Till:
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    background: '#262b39',
                    border: '1px solid #30384a',
                    color: '#fff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '13px'
                  }}
                />
              </label>
              {(startDate || endDate) && (
                <button
                  className="secondary"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  style={{ padding: '4px 10px', height: 'auto', fontSize: '12px' }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {filteredSessions.length ? (
            <div className="sessions-table-wrap">
              <table className="sessions-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Game</th>
                    <th>Started</th>
                    <th>Ended</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map((session) => (
                    <tr key={session.id}>
                      <td>#{session.id}</td>
                      <td>{session.gameTitle}</td>
                      <td>{new Date(session.startedAt).toLocaleString('en-US')}</td>
                      <td>
                        {session.endedAt ? new Date(session.endedAt).toLocaleString('en-US') : '-'}
                      </td>
                      <td>{formatDuration(session.durationMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No sessions match the selected dates.</p>
          )}
        </article>
      ) : null}
    </section>
  );
}

export default ProfilePage;
