import { useEffect, useState, useCallback } from 'react';
import { EVENTS, ROOM_STATUS } from '../../../shared/constants.js';
import { emitAsync, checkAuth } from '../socket.js';

const STATUS_LABEL = {
  [ROOM_STATUS.WAITING]: 'Esperando',
  [ROOM_STATUS.PLAYING]: 'Jugando',
  [ROOM_STATUS.FINISHED]: 'Terminada',
};

function formatAge(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'recién creada';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

// Panel de administración (ruta #admin): listar y cerrar salas.
export default function AdminScreen() {
  const [authed, setAuthed] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [rooms, setRooms] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const res = await emitAsync(EVENTS.ADMIN_LIST, {});
      setRooms(res.rooms || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Si ya hay cookie de admin (recarga), saltar el login.
  useEffect(() => {
    checkAuth()
      .then(({ isAdmin }) => setAuthed(!!isAdmin))
      .catch(() => {});
  }, []);

  // Una vez autenticado, refrescar la lista periódicamente.
  useEffect(() => {
    if (!authed) return;
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [authed, refresh]);

  const login = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/admin/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Código incorrecto.');
      setAuthed(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const closeRoom = async (roomCode) => {
    setError(null);
    try {
      const res = await emitAsync(EVENTS.ADMIN_CLOSE, { code: roomCode });
      setRooms(res.rooms || []);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!authed) {
    return (
      <div className="screen center">
        <div className="card-panel">
          <h1 className="title">Administración</h1>
          <p className="subtitle">Introduce el código de administrador</p>
          <form onSubmit={login} className="form">
            <input
              className="input"
              type="password"
              autoFocus
              placeholder="Código de administrador"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary" disabled={!code}>
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="topbar">
        <h1 className="title">Salas ({rooms.length})</h1>
        <button className="btn btn-ghost btn-sm" onClick={refresh}>
          Actualizar
        </button>
      </header>

      <div className="content">
        {error && <p className="error">{error}</p>}
        {rooms.length === 0 && <p className="muted center">No hay salas abiertas.</p>}

        <ul className="admin-list">
          {rooms.map((room) => (
            <li key={room.code} className="admin-room">
              <div className="admin-room-head">
                <span className="room-code-sm">{room.code}</span>
                <span className={`tag tag-${room.status}`}>{STATUS_LABEL[room.status]}</span>
              </div>
              <div className="admin-room-meta">
                <span>
                  {room.connectedCount}/{room.playerCount} conectados
                </span>
                <span className="muted">creada hace {formatAge(room.ageMs)}</span>
                <span className="muted">inactiva {formatAge(room.idleMs)}</span>
              </div>
              <div className="admin-room-players">
                {room.players.map((p, i) => (
                  <span key={i} className={p.connected ? '' : 'muted'}>
                    {p.nickname}
                    {i < room.players.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => closeRoom(room.code)}>
                Cerrar sala
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
