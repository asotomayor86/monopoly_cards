import { PROPERTY_GROUPS } from '../../../shared/constants.js';

// Carta de Monopoly Deal. `card` es un objeto del estado serializado.
// Variantes: normal (mano) y compacta (mesa/banco). `selected`/`onClick` para
// interacción. Se estila por tipo; las propiedades y comodines usan el/los
// color(es) de su grupo.

const ACTION_ICON = {
  pass_go: '🟢',
  just_say_no: '🚫',
  sly_deal: '🤏',
  forced_deal: '🔁',
  deal_breaker: '💥',
  debt_collector: '💸',
  birthday: '🎂',
  double_rent: '✖️2',
  house: '🏠',
  hotel: '🏨',
};

function groupHex(g) {
  return PROPERTY_GROUPS[g]?.hex || '#888';
}

/** Banda(s) de color según el grupo o par de grupos de una carta. */
function ColorBar({ groups }) {
  if (groups === 'any') {
    return (
      <div
        className="card-bar"
        style={{ background: 'linear-gradient(90deg,#d23b3b,#e8892b,#f2c62e,#2e9e5b,#1f3f9e)' }}
      />
    );
  }
  const list = Array.isArray(groups) ? groups : [groups];
  return (
    <div className="card-bar card-bar-split">
      {list.map((g) => (
        <span key={g} style={{ background: groupHex(g), flex: 1 }} />
      ))}
    </div>
  );
}

export default function Card({ card, compact = false, selected = false, disabled = false, onClick, badge }) {
  const cls = [
    'game-card',
    `card-${card.type}`,
    compact ? 'card-compact' : '',
    selected ? 'card-selected' : '',
    disabled ? 'card-disabled' : '',
    onClick ? 'card-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handle = onClick && !disabled ? () => onClick(card) : undefined;

  let body;
  switch (card.type) {
    case 'property':
      body = (
        <>
          <ColorBar groups={card.assignedGroup || card.group} />
          <span className="card-name">{card.name}</span>
          {!compact && <span className="card-val">{card.value} M</span>}
        </>
      );
      break;
    case 'wild':
      body = (
        <>
          <ColorBar groups={card.groups} />
          <span className="card-name">{card.name}</span>
          {!compact && card.value > 0 && <span className="card-val">{card.value} M</span>}
        </>
      );
      break;
    case 'money':
      body = (
        <>
          <span className="card-money">{card.value}</span>
          <span className="card-money-unit">M</span>
        </>
      );
      break;
    case 'rent':
      body = (
        <>
          <ColorBar groups={card.groups} />
          <span className="card-name">{card.name}</span>
          {!compact && <span className="card-val">{card.value} M</span>}
        </>
      );
      break;
    case 'action':
      body = (
        <>
          <span className="card-action-icon">{ACTION_ICON[card.action] || '★'}</span>
          <span className="card-name">{card.name}</span>
          {!compact && <span className="card-val">{card.value} M</span>}
        </>
      );
      break;
    default:
      body = <span className="card-name">{card.name}</span>;
  }

  return (
    <div className={cls} onClick={handle} role={handle ? 'button' : undefined}>
      {badge != null && <span className="card-badge">{badge}</span>}
      {body}
    </div>
  );
}
