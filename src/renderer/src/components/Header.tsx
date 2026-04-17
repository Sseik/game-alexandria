import { useAuth } from '@renderer/context/AuthContext';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AppLogo from '../assets/logo.webp';
import AvatarPlaceholder from '../assets/avatar-placeholder.png';
import { useEffect, useState, useRef } from 'react';

function Header(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { logout } = useAuth();
  const { user, isAuthenticated } = useAuth();
  const [optionsVisible, setOptionsVisibility] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const optionsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setSearchQuery(searchParams.get('q') || '');
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (optionsTimeoutRef.current) {
        clearTimeout(optionsTimeoutRef.current);
      }
    };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedQuery = searchQuery.trim();
    navigate(normalizedQuery ? `/search?q=${encodeURIComponent(normalizedQuery)}` : '/search');
  };

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/library');
  };

  const handleLogout = () => {
    logout();
    setOptionsVisibility(false);
    navigate('/login');
  };

  const handleOpenSettings = () => {
    setOptionsVisibility(false);
    navigate('/settings');
  };

  return (
    <header>
      <img className="logo" src={AppLogo} alt="Site logo" />
      <h1>GameAlexandria</h1>
      <button className="header-back" onClick={handleGoBack} aria-label="Go back" type="button">
        🢨
      </button>
      <form className="search-form" onSubmit={handleSearchSubmit}>
        <input
          className="search-input"
          type="search"
          placeholder="Enter the game's name"
          aria-label="Search games"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery ? (
          <button
            className="search-clear"
            type="button"
            aria-label="Clear search"
            onClick={() => setSearchQuery('')}
          >
            ×
          </button>
        ) : null}
        <button className="search-button" type="submit" aria-label="Run search">
          🔍
        </button>
      </form>
      {isAuthenticated ? (
        <div
          className="user-menu"
          onMouseEnter={() => {
            if (optionsTimeoutRef.current) {
              clearTimeout(optionsTimeoutRef.current);
              optionsTimeoutRef.current = null;
            }
            setOptionsVisibility(true);
          }}
          onMouseLeave={() => {
            optionsTimeoutRef.current = setTimeout(() => {
              setOptionsVisibility(false);
            }, 300);
          }}
        >
          <Link className="avatar-link" to="/profile" aria-label="Open profile">
            <img className="avatar" src={AvatarPlaceholder} alt="User avatar" />
          </Link>
          <Link className="username" to="/profile">
            {user?.username}
          </Link>
          {optionsVisible && (
            <div className="options">
              <button type="button" onClick={handleOpenSettings}>
                Settings
              </button>
              <button type="button" onClick={handleLogout}>
                Log Out
              </button>
            </div>
          )}
        </div>
      ) : location.pathname === '/login' || location.pathname === '/register' ? null : (
        <div className="auth-nav" aria-label="Authentication navigation">
          <span
            className={`auth-nav-pill ${location.pathname === '/register' ? 'register' : 'login'}`}
          />
          <Link className="auth-nav-link login" to="/login">
            Log In
          </Link>
          <Link className="auth-nav-link register" to="/register">
            Sign Up
          </Link>
        </div>
      )}
    </header>
  );
}

export default Header;
