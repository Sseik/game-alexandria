import { useAuth } from '@renderer/context/AuthContext';
import { Link } from 'react-router-dom';
import ElectronSVG from '../assets/electron.svg';

function Header(): React.JSX.Element {
  const { user, isAuthenticated } = useAuth();
  return (
    <header>
      <img className="logo" src={ElectronSVG} alt="Site's Logo" />
      <h1>GameAlexandria</h1>
      {isAuthenticated ? (
        <>
          <img className="avatar" src={ElectronSVG} alt="User's Avatar" />
          <span className="username">{user?.username}</span>
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
