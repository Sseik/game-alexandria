import { RecentSessionGame } from '../../../shared/types';

interface QuickLaunchProps {
  recentlyPlayed: RecentSessionGame[];
  onLaunch: (gameId: string, platformId?: string) => void;
}

function QuickLaunch(props: QuickLaunchProps): React.JSX.Element {
  return (
    <>
      <h2>Quick Launch</h2>
      <ul className="recentlyPlayed">
        {props.recentlyPlayed.map((game) => (
          <li className="recentlyPlayedItem" key={`${game.gameId}-${game.lastPlayedAt}`}>
            <div className="recentlyPlayedThumb" aria-hidden="true">
              {game.image ? <img src={game.image} alt="" /> : null}
            </div>
            <div className="recentlyPlayedMeta">
              <span className="title">{game.title}</span>
              <small>{game.platformName ? game.platformName : 'No platform configured'}</small>
            </div>
            <button
              type="button"
              className="quick-launch-button"
              onClick={() => props.onLaunch(game.gameId, game.platformId)}
            >
              {game.canLaunch ? 'Launch' : 'Configure'}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export default QuickLaunch;
