import { useEffect, useState, useCallback, useRef } from 'react';
import { EVENTS, ROOM_STATUS } from '../../shared/constants.js';
import { emitAsync, subscribeRoom, checkAuth, logout, enterHubRoom, setServerSession } from './socket.js';
import { trySessionFromHub } from './auth.js';
import { session } from './state/session.js';
import LoginScreen from './pages/LoginScreen.jsx';
import Lobby from './pages/Lobby.jsx';
import RoomScreen from './pages/RoomScreen.jsx';
import GameBoard from './pages/GameBoard.jsx';
import AdminScreen from './pages/AdminScreen.jsx';

// El panel de administración vive en la ruta con hash #admin.
const IS_ADMIN_ROUTE =
  typeof window !== 'undefined' && window.location.hash.replace('#', '') === 'admin';

// Código de sala del hub que abre el juego: URL ?sala=CÓDIGO.
const SALA_CODE =
  typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('sala') || '').trim().toUpperCase()
    : '';

export default function App() {
  if (IS_ADMIN_ROUTE) return <AdminScreen />;
  return <PlayerApp />;
}

function PlayerApp() {
  const [screen, setScreen] = useState('loading'); // loading | access | lobby | room
  const [room, setRoom] = useState(null);
  const [game, setGame] = useState(null);
  const [notice, setNotice] = useState(null);
  const unsubRef = useRef(null);

  const stopSub = useCallback(() => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
  }, []);

  // Abre el stream SSE de la sala: cada 'update' trae room + game ya filtrados.
  const startSub = useCallback(
    (code, playerId) => {
      stopSub();
      unsubRef.current = subscribeRoom(code, playerId, {
        onUpdate: ({ room, game }) => {
          setRoom(room);
          setGame(game ?? null);
          setScreen('room');
        },
        onGone: () => {
          stopSub();
          session.clearRoom();
          setRoom(null);
          setGame(null);
          setNotice('La sala se ha cerrado.');
          setScreen('lobby');
        },
      });
    },
    [stopSub]
  );

  // Entra en una sala creada en el hub (flujo ?sala=CÓDIGO): valida contra el hub
  // y siembra/une la sala del juego, saltándose el lobby propio.
  const entrarEnSala = useCallback(
    async (code) => {
      try {
        const res = await enterHubRoom(code);
        const nick = res.room?.players?.find((p) => p.id === res.playerId)?.nickname;
        session.setRoom(res.code, res.playerId, nick);
        setRoom(res.room);
        setGame(res.game ?? null);
        setNotice(null);
        setScreen('room');
        startSub(res.code, res.playerId);
      } catch (err) {
        setNotice(err.message || 'No se pudo entrar en la sala.');
        setScreen('lobby');
      }
    },
    [startSub]
  );

  // Arranque: comprobar acceso (cookie) e intentar reconectar a la sala guardada.
  useEffect(() => {
    let cancelled = false;

    const proceed = () => {
      if (cancelled) return;
      // Si el juego se abrió desde una sala del hub, entramos directos.
      if (SALA_CODE) {
        entrarEnSala(SALA_CODE);
        return;
      }
      const saved = session.getRoom();
      if (saved.code && saved.playerId) {
        emitAsync(EVENTS.ROOM_RECONNECT, { code: saved.code, playerId: saved.playerId })
          .then((res) => {
            if (cancelled) return;
            setRoom(res.room);
            if (res.game) setGame(res.game);
            setScreen('room');
            startSub(saved.code, saved.playerId);
          })
          .catch(() => {
            if (cancelled) return;
            session.clearRoom();
            setScreen('lobby');
          });
      } else {
        setScreen('lobby');
      }
    };

    (async () => {
      try {
        const r = await checkAuth();
        if (cancelled) return;
        if (r.isSite) {
          proceed();
          return;
        }
        // Sin cookie del juego: intentamos heredar la sesión del hub. Si el
        // navegador la acepta cross-origin (SameSite=None o navegación
        // top-level reciente), nos ahorramos el login.
        const hubUser = await trySessionFromHub();
        if (cancelled) return;
        if (hubUser) {
          try {
            await setServerSession(hubUser);
            const r2 = await checkAuth();
            if (cancelled) return;
            if (r2.isSite) {
              proceed();
              return;
            }
          } catch {
            /* caemos al login con email+contraseña */
          }
        }
        setScreen('access');
      } catch {
        if (!cancelled) setScreen('access');
      }
    })();

    return () => {
      cancelled = true;
      stopSub();
    };
  }, [startSub, stopSub, entrarEnSala]);

  const handleAccessGranted = () => {
    setNotice(null);
    // Si se abrió desde una sala del hub, entramos directos; si no, al lobby.
    if (SALA_CODE) {
      entrarEnSala(SALA_CODE);
      return;
    }
    setScreen('lobby');
  };

  const handleEnterRoom = (res, nickname) => {
    session.setRoom(res.roomCode, res.playerId, nickname);
    setRoom(res.room);
    setNotice(null);
    setScreen('room');
    startSub(res.roomCode, res.playerId);
  };

  const handleLeaveRoom = async () => {
    stopSub();
    try {
      await emitAsync(EVENTS.ROOM_LEAVE, {});
    } catch {
      /* salimos igualmente en el cliente */
    }
    session.clearRoom();
    setRoom(null);
    setGame(null);
    setScreen('lobby');
  };

  const handleLogout = async () => {
    stopSub();
    try {
      await emitAsync(EVENTS.ROOM_LEAVE, {});
    } catch {
      /* puede que no estuviéramos en sala */
    }
    session.clearRoom();
    await logout();
    setRoom(null);
    setGame(null);
    setScreen('access');
  };

  if (screen === 'loading') {
    return <div className="screen center">Cargando…</div>;
  }
  if (screen === 'access') {
    return <LoginScreen notice={notice} onGranted={handleAccessGranted} />;
  }
  if (screen === 'room' && room) {
    const inGame = room.status === ROOM_STATUS.PLAYING || room.status === ROOM_STATUS.FINISHED;
    if (inGame) {
      if (!game) return <div className="screen center">Cargando partida…</div>;
      const myId = session.getRoom().playerId;
      return <GameBoard room={room} game={game} myId={myId} onLeave={handleLeaveRoom} />;
    }
    return <RoomScreen room={room} onLeave={handleLeaveRoom} />;
  }
  return <Lobby notice={notice} onEnterRoom={handleEnterRoom} onLogout={handleLogout} />;
}
