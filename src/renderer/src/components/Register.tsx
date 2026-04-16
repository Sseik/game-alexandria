import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function Register(): React.JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    navigate('/login');
  };

  return (
    <section className="auth-screen">
      <form className="auth-form" onSubmit={handleRegister}>
        <h2>Welcome!</h2>
        {error && <div className="error-message">{error}</div>}
        <label htmlFor="register-email">Email:</label>
        <input
          className="auth-input"
          type="email"
          id="register-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          required
        />
        <label htmlFor="register-password">Password:</label>
        <input
          className="auth-input"
          type="password"
          id="register-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="*********"
          required
        />
        <label htmlFor="register-confirm-password">Confirm Password:</label>
        <input
          className="auth-input"
          type="password"
          id="register-confirm-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="*********"
          required
        />
        <button className="auth-submit" type="submit">
          Sign Up
        </button>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </section>
  );
}

export default Register;
