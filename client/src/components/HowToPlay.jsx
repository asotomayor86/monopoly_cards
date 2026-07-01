// Modal de reglas de Monopoly Deal (resumen). El detalle fino (cartas de acción,
// alquileres) se refleja en la mesa de juego en la Fase 3.
export default function HowToPlay({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal howto" onClick={(e) => e.stopPropagation()}>
        <h2>¿Cómo se juega?</h2>

        <p className="howto-goal">
          🎯 Sé el primero en completar <strong>3 sets de propiedades</strong> de
          colores distintos.
        </p>

        <h3>En tu turno</h3>
        <p>
          Roba <strong>2 cartas</strong> y juega hasta <strong>3</strong>: coloca
          propiedades, guarda cartas en tu <strong>banco</strong> (dinero) o usa cartas de{' '}
          <strong>acción</strong>. Al acabar, si tienes más de 7 cartas en la mano,
          descarta hasta quedarte con 7.
        </p>

        <h3>Las cartas</h3>
        <ul className="howto-list">
          <li>
            <strong>🏠 Propiedades</strong> — calles de Madrid agrupadas por color
            (Marrón, Celeste, Rosa, Naranja, Rojo, Amarillo, Verde, Azul oscuro), más{' '}
            <strong>Estaciones</strong> y <strong>Compañías</strong>. Completa un grupo
            para tener un <em>set</em>.
          </li>
          <li>
            <strong>🌈 Comodines</strong> — propiedades que valen para dos colores (o
            para cualquiera) y ayudan a cerrar sets.
          </li>
          <li>
            <strong>💶 Dinero</strong> — se guarda en el banco para pagar alquileres y deudas.
          </li>
          <li>
            <strong>🏷️ Alquiler</strong> — cobra a los rivales según cuántas propiedades
            tengas de ese color.
          </li>
          <li>
            <strong>🎬 Acciones</strong>: Trato Directo (roba un set), Robo (roba una
            propiedad), Trato Forzoso (intercambio), Cobrador, ¡Es mi cumpleaños!, Pasa por
            la Salida (roba 2), Casa y Hotel (suben el alquiler), Doble Alquiler y{' '}
            <strong>¡Ni Hablar!</strong> (anula una acción en tu contra).
          </li>
        </ul>

        <h3>Pagos</h3>
        <p className="muted">
          Cuando te cobran, pagas con dinero del banco y/o propiedades. Si no tienes con
          qué pagar, no debes nada. Ganas al tener <strong>3 sets completos</strong>.
        </p>

        <div className="modal-btns">
          <button className="btn btn-primary" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
