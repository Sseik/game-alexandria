import ElectronSVG from "../assets/electron.svg";
import GameCard from "./GameCard";

let games: Game[] = [
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
    {coverImage: ElectronSVG, title: "Game", platform: "Steam"},
]

function GamesGrid() {
  return <section className="games">
    {games.map(game => <GameCard game={game} />)}
  </section>;
}

export default GamesGrid;
