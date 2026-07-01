import { useState } from 'react';
import { HUB_URL } from '../auth.js';
import HowToPlay from '../components/HowToPlay.jsx';

// Pantalla puente: si el jugador llega aquí (sin ?sala=...), le decimos que la
// partida tiene que venir del hub. Ya no se puede crear ni unirse a una sala
// desde el juego — todas vienen de salas/ligas del hub.
export default function Lobby({ notice, onLogout }) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="title">Monopoly Deal</h1>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          Salir
        </button>
      </header>

      <div className="content center">
        {notice && <p className="notice">{notice}</p>}

        <div className="card-panel">
          <h2 className="subtitle">Las partidas vienen del hub</h2>
          <p className="muted" style={{ marginTop: 6, marginBottom: 14 }}>
            Para jugar una partida, abre una sala o una liga desde el hub
            familiar. Allí elige los jugadores y entra desde el enlace que
            te dé.
          </p>
          <a
            href={HUB_URL}
            className="btn btn-primary btn-lg"
            style={{ display: 'inline-block', textDecoration: 'none' }}
          >
            Ir al hub →
          </a>
          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-ghost btn-sm howto-link"
              onClick={() => setShowHelp(true)}
            >
              ¿Cómo se juega?
            </button>
          </div>
        </div>
      </div>

      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
