import GamesGrid from "./GamesGrid";

function Library() {
  return (
    <>
      <h2>Library</h2>
      <label htmlFor="sorting-options">Sort: </label>
      <select name="sorting-options" id="sorting-options">
        <option value="name">Recently Bought</option>
        <option value="name">Recently Played</option>
        <option value="name">By Name (A-Z)</option>
        <option value="name">By Name (Z-A)</option>
        <option value="name">In-Game Time</option>
      </select>
      <GamesGrid />
    </>
  );
}

export default Library;
