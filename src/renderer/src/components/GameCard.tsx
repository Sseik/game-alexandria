interface GameCardProps {
  game: Game;
}

function GameCard(props: GameCardProps) {
  return (
    <div className="game-card">
      <img src={props.game.coverImage} alt="Game's Cover" />
      <span className="game-title">{props.game.title}</span>
    </div>
  );
}

export default GameCard;
