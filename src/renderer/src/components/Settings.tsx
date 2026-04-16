import { useAuth } from '@renderer/context/AuthContext';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type SettingsTab = 'profile' | 'appearance' | 'launch';

const SETTINGS_KEY = 'renderer.settings';

type LocalSettings = {
  activeTab: SettingsTab;
  compactCards: boolean;
  accentColor: string;
  defaultPlatform: string;
  autoOpenLibrary: boolean;
};

function readLocalSettings(): LocalSettings | null {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<LocalSettings>;
    return {
      activeTab:
        parsed.activeTab === 'profile' ||
        parsed.activeTab === 'appearance' ||
        parsed.activeTab === 'launch'
          ? parsed.activeTab
          : 'profile',
      compactCards: Boolean(parsed.compactCards),
      accentColor: typeof parsed.accentColor === 'string' ? parsed.accentColor : '#5a5a5a',
      defaultPlatform:
        typeof parsed.defaultPlatform === 'string' ? parsed.defaultPlatform : 'steam',
      autoOpenLibrary: typeof parsed.autoOpenLibrary === 'boolean' ? parsed.autoOpenLibrary : true
    };
  } catch {
    return null;
  }
}

function Settings(): React.JSX.Element {
  const navigate = useNavigate();
  const { user } = useAuth();
  const initialSettings = readLocalSettings();

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialSettings?.activeTab ?? 'profile');
  const [compactCards, setCompactCards] = useState(initialSettings?.compactCards ?? false);
  const [accentColor, setAccentColor] = useState(initialSettings?.accentColor ?? '#5a5a5a');
  const [defaultPlatform, setDefaultPlatform] = useState(
    initialSettings?.defaultPlatform ?? 'steam'
  );
  const [autoOpenLibrary, setAutoOpenLibrary] = useState(initialSettings?.autoOpenLibrary ?? true);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [navigate, user]);

  useEffect(() => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        activeTab,
        compactCards,
        accentColor,
        defaultPlatform,
        autoOpenLibrary
      } satisfies LocalSettings)
    );
  }, [accentColor, activeTab, autoOpenLibrary, compactCards, defaultPlatform]);

  if (!user) {
    return <section className="settings" />;
  }

  return (
    <section className="settings">
      <h2>Settings</h2>

      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'profile'}
          className={`settings-tab ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'appearance'}
          className={`settings-tab ${activeTab === 'appearance' ? 'active' : ''}`}
          onClick={() => setActiveTab('appearance')}
        >
          Appearance
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'launch'}
          className={`settings-tab ${activeTab === 'launch' ? 'active' : ''}`}
          onClick={() => setActiveTab('launch')}
        >
          Launch Defaults
        </button>
      </div>

      {activeTab === 'profile' && (
        <div className="settings-card" role="tabpanel">
          <h3>Profile</h3>
          <p>
            <strong>Username:</strong> {user.username}
          </p>
          <p>
            <strong>Email:</strong> {user.email}
          </p>
          <p>
            <strong>Role ID:</strong> {user.roleId}
          </p>
        </div>
      )}

      {activeTab === 'appearance' && (
        <div className="settings-card" role="tabpanel">
          <h3>Appearance</h3>
          <label className="settings-row">
            <span>Compact game cards</span>
            <input
              type="checkbox"
              checked={compactCards}
              onChange={(e) => setCompactCards(e.target.checked)}
            />
          </label>
          <label className="settings-row">
            <span>Accent color</span>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
            />
          </label>
          <p className="empty-state">UI preview-only controls for now.</p>
        </div>
      )}

      {activeTab === 'launch' && (
        <div className="settings-card" role="tabpanel">
          <h3>Launch Defaults</h3>
          <label className="settings-row">
            <span>Default platform</span>
            <select value={defaultPlatform} onChange={(e) => setDefaultPlatform(e.target.value)}>
              <option value="steam">Steam</option>
              <option value="epic">Epic Games</option>
              <option value="gog">GOG</option>
            </select>
          </label>
          <label className="settings-row">
            <span>Open library after login</span>
            <input
              type="checkbox"
              checked={autoOpenLibrary}
              onChange={(e) => setAutoOpenLibrary(e.target.checked)}
            />
          </label>
          <p className="empty-state">Behavior is local until backend wiring is enabled.</p>
        </div>
      )}
    </section>
  );
}

export default Settings;
