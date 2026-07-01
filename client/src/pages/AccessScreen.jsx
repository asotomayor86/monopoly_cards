import { useState } from 'react';
import HowToPlay from '../components/HowToPlay.jsx';

// Pantalla de acceso a la web mediante el código compartido.
export default function AccessScreen({ onGranted, notice }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Código incorrecto.');
      onGranted();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen center">
      <div className="card-panel">
        <h1 className="title">Monopoly Deal</h1>
        <p className="subtitle">Introduce el código de acceso</p>
        {notice && <p className="notice">{notice}</p>}
        <form onSubmit={submit} className="form">
          <input
            className="input"
            type="password"
            inputMode="text"
            autoFocus
            placeholder="Código de acceso"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={loading || !code}>
            {loading ? 'Comprobando…' : 'Entrar'}
          </button>
        </form>
        <button type="button" className="btn btn-ghost btn-sm howto-link" onClick={() => setShowHelp(true)}>
          ¿Cómo se juega?
        </button>
      </div>
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
