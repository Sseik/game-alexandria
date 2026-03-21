import { Link } from "react-router-dom";

function Menu(): React.JSX.Element {
  return (
    <>
      <ul className="menu">
        <li>All Games</li>
        <li><Link to="/library">Library</Link></li>
        <li>Wishlist</li>
      </ul>
    </>
  );
}

export default Menu;
