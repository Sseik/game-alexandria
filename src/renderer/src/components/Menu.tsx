import { NavLink } from 'react-router-dom';
import { useAuth } from '@renderer/context/AuthContext';

function Menu(): React.JSX.Element {
  const { user } = useAuth();
  const isAdmin = user?.roleId === 1;

  return (
    <>
      <ul className="menu">
        <li>
          <NavLink to="/games">Home</NavLink>
        </li>
        <li>
          <NavLink to="/library">Library</NavLink>
        </li>
        <li>
          <NavLink to="/wishlist">Wishlist</NavLink>
        </li>
        {isAdmin ? (
          <li>
            <NavLink to="/admin">Admin</NavLink>
          </li>
        ) : null}
      </ul>
    </>
  );
}

export default Menu;
