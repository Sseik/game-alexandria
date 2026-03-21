import GameCard from './GameCard';
import { Game } from 'src/shared/types';

interface GamesGridProps {
  games: Game[];
}

function GamesGrid(props: GamesGridProps) {
  return (
    <section className="games">
      {props.games.map((game) => (
        <GameCard game={game} key={game.id}/>
      ))}
    </section>
  );
}

export default GamesGrid;
