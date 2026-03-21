import { useAuth } from '@renderer/context/AuthContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login(): React.JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const handleLogin = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setError('');

    const result = await window.api.login({ email, password });

    if (result.success) {
      login(result.user!);
      navigate('/library');
    } else {
      setError(result.error!);
    }
  };

  return (
    <section className="login">
      <h2>Login</h2>
      <form onSubmit={handleLogin}>
        {error && <div className="error-message">{error}</div>}
        <label htmlFor="email">Email: </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">Password: </label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Log In</button>
      </form>
    </section>
  );
}

export default Login;
