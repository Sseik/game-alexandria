import { useAuth } from '@renderer/context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import ElectronSVG from '../assets/electron.svg';
import { useState } from 'react';

function Header(): React.JSX.Element {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { user, isAuthenticated } = useAuth();
  const [optionsVisible, setOptionsVisibility] = useState<boolean>(false);
  return (
    <header>
      <img className="logo" src={ElectronSVG} alt="Site's Logo" />
      <h1>GameAlexandria</h1>
      {isAuthenticated ? (
        <>
          <img className="avatar" src={ElectronSVG} alt="User's Avatar" />
          <span
            className="username"
            onMouseOver={() => setOptionsVisibility(true)}
            onMouseLeave={() => setTimeout(() => setOptionsVisibility(false), 3000)}
          >
            {user?.username}
          </span>
          {optionsVisible && (
            <div className="options">
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                Log Out
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <Link to="/login">Log In</Link>
          <Link to="/login">Sign Up</Link>
        </>
      )}
    </header>
  );
}

export default Header;
