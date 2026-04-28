import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@renderer/context/AuthContext';
import { supabase } from '../shared/supabaseClient'; 

function Register(): React.JSX.Element {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);

    // 1. Реєструємо користувача в Supabase Auth
    const { error: supaError } = await supabase.auth.signUp({
      email,
      password
    });

    if (supaError) {
      setError(supaError.message);
      setIsLoading(false);
      return;
    }

    // 2. Якщо в хмарі все ОК, створюємо профіль у нашій таблиці app_user
    // Зауваж: пароль сюди вже не передаємо, він у безпеці в хмарі
    const result = await window.api.register({ email, username });

    if (result.success) {
      login(result.user!);
      navigate('/library');
    } else {
      setError(result.error || 'Failed to sync with local database');
    }

    setIsLoading(false);
  };

  return (
    <section className="auth-screen">
      <form className="auth-form" onSubmit={handleRegister}>
        <h2>Create Account</h2>
        {error && <div className="error-message">{error}</div>}

        <label htmlFor="register-username">Username:</label>
        <input
          className="auth-input"
          type="text"
          id="register-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Gamer123"
          required
        />

        <label htmlFor="register-email">Email:</label>
        <input
          className="auth-input"
          type="email"
          id="register-email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
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
          minLength={6}
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

        <button className="auth-submit" type="submit" disabled={isLoading}>
          {isLoading ? 'Signing Up...' : 'Sign Up'}
        </button>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </section>
  );
}

export default Register;
