import GameCard from './GameCard';
import { Game } from '../../../shared/types';

interface GamesGridProps {
  games: Game[];
  showLaunchAction?: boolean;
  onLaunchGame?: (game: Game) => void;
  showEditAction?: boolean;
  onEditGame?: (game: Game) => void;
}

function GamesGrid(props: GamesGridProps) {
  return (
    <section className="games">
      {props.games.map((game, index) => (
        <GameCard
          game={game}
          key={game.id || `${game.title}-${index}`}
          showLaunchAction={props.showLaunchAction}
          onLaunch={props.onLaunchGame}
          showEditAction={props.showEditAction}
          onEdit={props.onEditGame}
        />
      ))}
    </section>
  );
}

export default GamesGrid;
