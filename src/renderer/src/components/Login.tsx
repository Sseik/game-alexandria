import { useAuth } from '@renderer/context/AuthContext';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function Login(): React.JSX.Element {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await window.api.login({ email, password });

    if (result.success) {
      login(result.user!);
      navigate('/library');
    } else {
      setError(result.error!);
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Будь ласка, спочатку введіть Email');
      return;
    }

    setError('');
    setLoading(true);

    // Викликаємо метод через міст Electron (window.api)
    const result = await window.api.resetPassword(email);

    if (result.success) {
      setResetSent(true);
    } else {
      setError(result.error || 'Помилка під час скидання пароля');
    }
    setLoading(false);
  };

  return (
    <section className="auth-screen">
      <form className="auth-form" onSubmit={handleLogin}>
        <h2>Welcome!</h2>

        {error && <div className="error-message">{error}</div>}
        {resetSent && (
          <div className="success-message">Лист для скидання пароля надіслано на вашу пошту!</div>
        )}

        <label htmlFor="email">Email:</label>
        <input
          className="auth-input"
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          required
        />

        <label htmlFor="password">Password:</label>
        <input
          className="auth-input"
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="*********"
          required
        />

        <div className="auth-options">
          <button
            type="button"
            className="link-btn"
            onClick={handleForgotPassword}
            disabled={loading}
          >
            Forgot password?
          </button>
        </div>

        <button className="auth-submit" type="submit" disabled={loading}>
          {loading ? 'Processing...' : 'Sign In'}
        </button>

        <p className="auth-footer">
          Don’t have an account? <Link to="/register">Sign up</Link>
        </p>
      </form>
    </section>
  );
}

export default Login;
