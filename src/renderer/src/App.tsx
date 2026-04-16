import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Main from './components/Main';
import { HashRouter } from 'react-router-dom';
import AuthProvider from './context/AuthContext';
import { useEffect } from 'react';

type LocalSettings = {
  accentColor: string;
};

function readLocalSettings(): LocalSettings | null {
  const raw = localStorage.getItem('renderer.settings');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalSettings>;
    return {
      accentColor: typeof parsed.accentColor === 'string' ? parsed.accentColor : '#5a5a5a'
    };
  } catch {
    return null;
  }
}

function App(): React.JSX.Element {
  useEffect(() => {
    const settings = readLocalSettings();
    const accentColor = settings?.accentColor ?? '#5a5a5a';
    document.documentElement.style.setProperty('--ev-accent-color', accentColor);
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      const settings = readLocalSettings();
      const accentColor = settings?.accentColor ?? '#5a5a5a';
      document.documentElement.style.setProperty('--ev-accent-color', accentColor);
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <>
      <AuthProvider>
        <HashRouter>
          <Header />
          <Sidebar />
          <Main />
        </HashRouter>
      </AuthProvider>
    </>
  );
}

export default App;
