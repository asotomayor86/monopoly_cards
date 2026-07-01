// Tablero de partida — PLACEHOLDER de la Fase 1.
//
// La UI real de la partida (cartas, mano, banco, sets de propiedades, alquileres,
// selección de objetivos, registro de jugadas) se construye en la Fase 3, sobre el
// motor de reglas de la Fase 2. Por ahora, al empezar una partida se muestra este
// aviso para que el flujo sala -> partida -> volver funcione de extremo a extremo.

export default function GameBoard({ room, onLeave }) {
  return (
    <div className="screen">
      <div className="topbar">
        <h1 className="title">Monopoly Deal</h1>
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>
          Salir
        </button>
      </div>
      <div className="content center">
        <div className="card-panel">
          <p className="subtitle">La partida llega en la Fase 3</p>
          <p className="muted">
            El motor de reglas (Fase 2) y la mesa de juego (Fase 3) están en camino.
            De momento esto confirma que la sala <strong>{room?.code}</strong> puede
            arrancar y cerrar una partida.
          </p>
        </div>
      </div>
    </div>
  );
}
