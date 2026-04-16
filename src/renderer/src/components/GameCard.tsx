import { useNavigate } from 'react-router-dom';
import { Game } from '../../../shared/types';
import { useMemo } from 'react';

type LocalSettings = {
  compactCards: boolean;
};

function readLocalSettings(): LocalSettings | null {
  const raw = localStorage.getItem('renderer.settings');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalSettings>;
    return {
      compactCards: Boolean(parsed.compactCards)
    };
  } catch {
    return null;
  }
}

interface GameCardProps {
  game: Game;
  showLaunchAction?: boolean;
  onLaunch?: (game: Game) => void;
  showEditAction?: boolean;
  onEdit?: (game: Game) => void;
}

function GameCard(props: GameCardProps) {
  const navigate = useNavigate();
  const artworkUrl = props.game.coverUrl || props.game.logoUrl;
  const canLaunch = Boolean(props.game.executablePath);
  const compactMode = useMemo(() => readLocalSettings()?.compactCards ?? false, []);

  const openDetails = () => {
    navigate(`/game/${props.game.id}`, { state: { game: props.game } });
  };

  return (
    <article
      className={`game-card${compactMode ? ' compact' : ''}`}
      role="button"
      tabIndex={0}
      onClick={openDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetails();
        }
      }}
    >
      <div className="game-card-link">
        <div className="game-card-cover" aria-hidden="true">
          {artworkUrl ? (
            <img src={artworkUrl} alt={`${props.game.title} cover`} loading="lazy" />
          ) : null}
        </div>
        <span className="game-title">{props.game.title}</span>
      </div>
      {props.showLaunchAction ? (
        <button
          type="button"
          className="game-launch-button"
          onClick={(event) => {
            event.stopPropagation();
            props.onLaunch?.(props.game);
          }}
        >
          {canLaunch ? 'Launch' : 'Configure launch'}
        </button>
      ) : null}
      {props.showEditAction ? (
        <button
          type="button"
          className="game-edit-button"
          onClick={(event) => {
            event.stopPropagation();
            props.onEdit?.(props.game);
          }}
        >
          Edit Launch
        </button>
      ) : null}
    </article>
  );
}

export default GameCard;
