import { useState } from 'react';
import { EVENTS, MIN_PLAYERS, MAX_PLAYERS } from '../../../shared/constants.js';
import { emitAsync } from '../socket.js';
import { session } from '../state/session.js';

// Sala de espera (estado WAITING). El tablero de partida lo gestiona GameBoard.
export default function RoomScreen({ room, onLeave }) {
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  const myId = session.getRoom().playerId;
  const me = room.players.find((p) => p.id === myId);
  const isHost = me?.isHost;
  const canStart = isHost && room.players.length >= MIN_PLAYERS;

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      await emitAsync(EVENTS.ROOM_START, {});
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="title">Sala de espera</h1>
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>
          Salir
        </button>
      </header>

      <div className="content">
        <div className="room-code-box">
          <span className="label">Código de sala</span>
          <span className="room-code">{room.code}</span>
          <span className="muted">Compártelo para que se unan</span>
        </div>

        <h2 className="subtitle">
          Jugadores ({room.players.length}/{MAX_PLAYERS})
        </h2>
        <ul className="player-list">
          {room.players.map((p) => (
            <li key={p.id} className="player-item">
              <span className={`dot ${p.connected ? 'dot-on' : 'dot-off'}`} />
              <span className="player-name">{p.nickname}</span>
              {p.isHost && <span className="badge">Anfitrión</span>}
              {p.id === myId && <span className="badge badge-you">Tú</span>}
              {!p.connected && <span className="muted">(desconectado)</span>}
            </li>
          ))}
        </ul>

        {error && <p className="error">{error}</p>}

        {isHost ? (
          <button className="btn btn-primary btn-lg" disabled={!canStart || starting} onClick={start}>
            {starting
              ? 'Empezando…'
              : canStart
                ? 'Empezar partida'
                : `Faltan jugadores (mín. ${MIN_PLAYERS})`}
          </button>
        ) : (
          <p className="muted center">Esperando a que el anfitrión empiece la partida…</p>
        )}
      </div>
    </div>
  );
}
