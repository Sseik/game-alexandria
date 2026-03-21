import Menu from './Menu';
import QuickLaunch from './QuickLaunch';
import ElectronSVG from '../assets/electron.svg';

interface Game {
  image: string;
  title: string;
}

let recentlyPlayed: Game[] = [
  { image: ElectronSVG, title: 'Title' },
  { image: ElectronSVG, title: 'Title' },
  { image: ElectronSVG, title: 'Title' },
  { image: ElectronSVG, title: 'Title' }
];

function Sidebar(): React.JSX.Element {
  return (
    <section className="sidebar">
      <Menu />
      <QuickLaunch recentlyPlayed={recentlyPlayed} />
    </section>
  );
}

export default Sidebar;
