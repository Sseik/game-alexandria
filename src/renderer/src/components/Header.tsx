import ElectronSVG from "../assets/electron.svg";

function Header(): React.JSX.Element {
  return (
    <header>
      <img className="logo" src={ElectronSVG} alt="Site's Logo" />
      <h1>GameAlexandria</h1>
      <img className="avatar" src={ElectronSVG} alt="User's Avatar" />
      <span className="username">Sseik</span>
    </header>
  );
}

export default Header;
