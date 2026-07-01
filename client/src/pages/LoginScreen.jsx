import { useState } from 'react';
import HowToPlay from '../components/HowToPlay.jsx';
import { loginConHub } from '../auth.js';
import { setServerSession } from '../socket.js';

// Inicio de sesión con la cuenta del hub (email+contraseña, mismas credenciales).
// El login verifica la contraseña contra Neon Auth; con el userId, fijamos la
// sesión del juego (cookie) llamando a /api/access.
export default function LoginScreen({ onGranted, notice }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await loginConHub(email.trim(), password);
      await setServerSession(user);
      onGranted(user);
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen center">
      <div className="card-panel">
        <h1 className="title">Monopoly Deal</h1>
        <p className="subtitle">Inicia sesión con tu cuenta del hub</p>
        {notice && <p className="notice">{notice}</p>}
        <form onSubmit={submit} className="form">
          <input
            className="input"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={loading || !email || !password}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="subtitle" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>
          ¿Sin cuenta o sin contraseña? Pide a un administrador que te invite desde el
          hub, o usa «He olvidado mi contraseña» allí.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm howto-link"
          onClick={() => setShowHelp(true)}
        >
          ¿Cómo se juega?
        </button>
      </div>
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
