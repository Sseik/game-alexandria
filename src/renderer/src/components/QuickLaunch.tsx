function QuickLaunch(props): React.JSX.Element {
  console.log(props.recentlyPlayed);
  return (
    <>
      <h2>Quick Launch</h2>
      <ul className="recentlyPlayed">
        {props.recentlyPlayed.map((game) => (
          <>
            <img src={game.image} alt="" />
            <span className="title">{game.title}</span>
          </>
        ))}
      </ul>
    </>
  );
}

export default QuickLaunch;
