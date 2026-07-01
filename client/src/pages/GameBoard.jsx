import { useState } from 'react';
import { EVENTS, PROPERTY_GROUPS } from '../../../shared/constants.js';
import { emitAsync } from '../socket.js';
import { HUB_URL } from '../auth.js';
import Card from '../components/Card.jsx';

// Mesa de juego de Monopoly Deal. Recibe `game` = estado serializado para el
// jugador (motor Fase 2) y despacha acciones al servidor (autoridad).
//
// Interacción mobile-first: se toca una carta de la mano y aparece una hoja con
// las jugadas válidas; las acciones dirigidas entran en un "modo objetivo" que
// resalta a quién/qué tocar. Los estados `pending` (pago, ¡Ni Hablar!) abren un
// overlay bloqueante para quien corresponda.

const label = (g) => PROPERTY_GROUPS[g]?.label ?? g;
const setSize = (g) => PROPERTY_GROUPS[g]?.setSize ?? 3;

export default function GameBoard({ room, game, myId, onLeave }) {
  const [flow, setFlow] = useState(null); // interacción en curso (ver más abajo)
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const me = game.players.find((p) => p.id === myId);
  const opponents = game.players.filter((p) => p.id !== myId);
  const hand = game.you?.hand || [];
  const pending = game.pending;
  const isMyTurn = game.currentPlayer === myId && !pending;
  const playsLeft = game.maxPlays - game.cardsPlayedThisTurn;

  async function dispatch(action) {
    setError(null);
    setBusy(true);
    try {
      await emitAsync(EVENTS.GAME_ACTION, { action });
      setFlow(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // --- Tap handlers según el flujo de targeting activo ---
  function tapPlayer(pid) {
    if (!flow) return;
    const c = flow.card;
    if (flow.t === 'debt') dispatch({ type: 'playAction', cardId: c.id, targetId: pid });
    else if (flow.t === 'rent' && flow.needTarget && flow.group)
      setFlow({ ...flow, target: pid });
    else if (flow.t === 'sly' && !flow.target) setFlow({ ...flow, target: pid });
    else if (flow.t === 'forced' && flow.myCard && !flow.target) setFlow({ ...flow, target: pid });
    else if (flow.t === 'dealbreaker' && !flow.target) setFlow({ ...flow, target: pid });
  }

  function tapOppProp(pid, group, cardId, complete) {
    if (!flow || complete) return;
    if (flow.t === 'sly' && flow.target === pid)
      dispatch({ type: 'playAction', cardId: flow.card.id, targetId: pid, propertyId: cardId });
    else if (flow.t === 'forced' && flow.target === pid && flow.myCard)
      dispatch({
        type: 'playAction',
        cardId: flow.card.id,
        targetId: pid,
        myCardId: flow.myCard,
        theirCardId: cardId,
      });
  }

  function tapOppSet(pid, group, complete) {
    if (!flow || !complete) return;
    if (flow.t === 'dealbreaker' && flow.target === pid)
      dispatch({ type: 'playAction', cardId: flow.card.id, targetId: pid, group });
  }

  function tapMyProp(group, cardId, complete) {
    if (!flow || complete) return;
    if (flow.t === 'forced' && !flow.myCard) setFlow({ ...flow, myCard: cardId });
  }

  function tapMySet(group, complete) {
    if (!flow) return;
    if (flow.t === 'house' && complete && group !== 'railroad' && group !== 'utility')
      dispatch({ type: 'playAction', cardId: flow.card.id, group });
  }

  // --- Menú contextual de una carta de la mano ---
  function openCard(card) {
    if (!isMyTurn || playsLeft <= 0) return;
    setError(null);
    setFlow({ t: 'menu', card });
  }

  const hasDoubleRent = hand.some((c) => c.action === 'double_rent');
  const doubleRentId = () => hand.find((c) => c.action === 'double_rent')?.id;

  // ------------------------------------------------------------------ render
  // La barra "toca a…" solo aparece cuando hay que tocar el tablero (jugador,
  // propiedad o set). Los pasos con menú (color del alquiler, confirmación) no.
  const targeting =
    flow &&
    (['debt', 'sly', 'forced', 'dealbreaker', 'house'].includes(flow.t) ||
      (flow.t === 'rent' && flow.needTarget && flow.group && !flow.target));

  return (
    <div className="screen board">
      <header className="topbar">
        <div className="turn-info">
          {game.status === 'finished' ? (
            <strong>Partida terminada</strong>
          ) : isMyTurn ? (
            <strong className="turn-mine">Tu turno · jugadas {game.cardsPlayedThisTurn}/{game.maxPlays}</strong>
          ) : (
            <span>Turno de {game.players.find((p) => p.id === game.currentPlayer)?.nickname}</span>
          )}
          <span className="muted board-counts">🂠 {game.deckCount} · 🗑 {game.discardCount}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onLeave}>Salir</button>
      </header>

      {error && <p className="error board-error">{error}</p>}
      {pending && !targeting && <PendingBanner game={game} myId={myId} />}
      {targeting && <TargetPrompt flow={flow} onCancel={() => setFlow(null)} />}

      <div className="content board-content">
        {/* Rivales */}
        <div className="opponents">
          {opponents.map((p) => (
            <PlayerPanel
              key={p.id}
              p={p}
              mine={false}
              flow={flow}
              onTapPlayer={() => tapPlayer(p.id)}
              onTapProp={(g, cid, comp) => tapOppProp(p.id, g, cid, comp)}
              onTapSet={(g, comp) => tapOppSet(p.id, g, comp)}
            />
          ))}
        </div>

        {/* Mi mesa */}
        <PlayerPanel
          p={me}
          mine
          flow={flow}
          onTapProp={(g, cid, comp) => tapMyProp(g, cid, comp)}
          onTapSet={(g, comp) => tapMySet(g, comp)}
        />

        {/* Mi mano */}
        <div className="hand-zone">
          <div className="hand-head">
            <span className="label">Tu mano ({hand.length})</span>
            {isMyTurn && (
              <button
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => (hand.length > 7 ? setFlow({ t: 'discard', selected: new Set() }) : dispatch({ type: 'endTurn' }))}
              >
                Terminar turno
              </button>
            )}
          </div>
          <div className="hand">
            {hand.map((c) => (
              <Card key={c.id} card={c} onClick={openCard} disabled={!isMyTurn || playsLeft <= 0} />
            ))}
            {hand.length === 0 && <span className="muted">Sin cartas</span>}
          </div>
        </div>

        <button className="btn btn-ghost btn-sm log-toggle" onClick={() => setShowLog((s) => !s)}>
          {showLog ? 'Ocultar registro' : 'Ver registro'}
        </button>
        {showLog && (
          <ul className="game-log">
            {[...game.log].reverse().map((l) => (
              <li key={l.seq}>{l.text}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Overlays */}
      {flow?.t === 'menu' && (
        <CardMenu
          card={flow.card}
          onClose={() => setFlow(null)}
          onBank={() => dispatch({ type: 'playMoney', cardId: flow.card.id })}
          onPlaceProperty={(group) => dispatch({ type: 'playProperty', cardId: flow.card.id, group })}
          onWildAny={() => setFlow({ t: 'wildAny', card: flow.card })}
          onImmediate={() => dispatch({ type: 'playAction', cardId: flow.card.id })}
          onStart={(t, extra) => setFlow({ t, card: flow.card, ...extra })}
        />
      )}
      {flow?.t === 'wildAny' && (
        <ColorPicker
          title="¿A qué color?"
          onClose={() => setFlow(null)}
          onPick={(group) => dispatch({ type: 'playProperty', cardId: flow.card.id, group })}
        />
      )}
      {flow?.t === 'rent' && (
        <RentFlow
          flow={flow}
          me={me}
          hasDoubleRent={hasDoubleRent}
          playsLeft={playsLeft}
          setFlow={setFlow}
          onCancel={() => setFlow(null)}
          onConfirm={({ _double, ...rest }) =>
            dispatch({
              type: 'playAction',
              cardId: flow.card.id,
              ...rest,
              ...(_double && doubleRentId() ? { doubleRentCardId: doubleRentId() } : {}),
            })
          }
        />
      )}
      {flow?.t === 'discard' && (
        <DiscardOverlay
          hand={hand}
          need={hand.length - 7}
          onCancel={() => setFlow(null)}
          onConfirm={(ids) => dispatch({ type: 'endTurn', discardIds: ids })}
        />
      )}
      {pending?.kind === 'payment' && pending.debtors.includes(myId) && (
        <PayOverlay game={game} me={me} amount={pending.amount} onPay={(ids) => dispatch({ type: 'pay', cardIds: ids })} />
      )}
      {pending?.kind === 'response' && pending.awaiting === myId && (
        <ResponseOverlay
          pending={pending}
          game={game}
          canSayNo={hand.some((c) => c.action === 'just_say_no')}
          onSayNo={() => dispatch({ type: 'sayNo' })}
          onAllow={() => dispatch({ type: 'allow' })}
        />
      )}
      {game.status === 'finished' && (
        <VictoryOverlay game={game} myId={myId} room={room} onLeave={onLeave} />
      )}
    </div>
  );
}

// --------------------------------------------------------------- subcomponentes

function PlayerPanel({ p, mine, flow, onTapPlayer, onTapProp, onTapSet }) {
  const targetablePlayer =
    flow && ((flow.t === 'debt') ||
      (flow.t === 'rent' && flow.needTarget && flow.group && !flow.target) ||
      (flow.t === 'sly' && !flow.target) ||
      (flow.t === 'forced' && flow.myCard && !flow.target) ||
      (flow.t === 'dealbreaker' && !flow.target));
  const isTarget = flow?.target === p.id;

  return (
    <div className={`player-panel ${mine ? 'mine' : ''} ${isTarget ? 'is-target' : ''}`}>
      <div
        className={`pp-head ${!mine && targetablePlayer ? 'tappable' : ''}`}
        onClick={!mine && targetablePlayer ? onTapPlayer : undefined}
      >
        <span className="pp-name">{mine ? 'Tú' : p.nickname}</span>
        <span className="pp-stats">
          {!mine && <>🂠 {p.handCount} · </>}💰 {p.bankValue} M · 🏆 {p.setsComplete}/3
        </span>
      </div>
      {/* Sets de propiedades */}
      <div className="pp-props">
        {Object.entries(p.properties).length === 0 && <span className="muted small">sin propiedades</span>}
        {Object.entries(p.properties).map(([g, pile]) => (
          <div
            key={g}
            className={`prop-pile ${pile.complete ? 'complete' : ''}`}
            style={{ borderColor: PROPERTY_GROUPS[g]?.hex }}
            onClick={onTapSet ? () => onTapSet(g, pile.complete) : undefined}
          >
            <span className="pile-head" style={{ color: PROPERTY_GROUPS[g]?.hex }}>
              {label(g)} {pile.cards.length}/{setSize(g)}
              {pile.house ? ' 🏠' : ''}{pile.hotel ? ' 🏨' : ''}
            </span>
            <div className="pile-cards">
              {pile.cards.map((c) => (
                <Card
                  key={c.id}
                  card={{ ...c, assignedGroup: g }}
                  compact
                  onClick={onTapProp ? () => onTapProp(g, c.id, pile.complete) : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* Banco */}
      {p.bank.length > 0 && (
        <div className="pp-bank">
          {p.bank.map((c) => (
            <Card key={c.id} card={c} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function CardMenu({ card, onClose, onBank, onPlaceProperty, onWildAny, onImmediate, onStart }) {
  const opts = [];
  const bankable = card.type === 'money' || card.type === 'action' || card.type === 'rent';
  if (card.type === 'property') opts.push({ k: 'prop', txt: `Colocar en ${label(card.group)}`, fn: () => onPlaceProperty(card.group) });
  if (card.type === 'wild') {
    if (card.groups === 'any') opts.push({ k: 'wildany', txt: 'Colocar (elige color)', fn: onWildAny });
    else card.groups.forEach((g) => opts.push({ k: 'w' + g, txt: `Colocar en ${label(g)}`, fn: () => onPlaceProperty(g) }));
  }
  if (card.type === 'rent') opts.push({ k: 'rent', txt: 'Cobrar alquiler', fn: () => onStart('rent', { needTarget: card.groups === 'any' }) });
  if (card.type === 'action') {
    const a = card.action;
    if (a === 'pass_go') opts.push({ k: 'a', txt: 'Robar 2 cartas', immediate: true });
    if (a === 'birthday') opts.push({ k: 'a', txt: 'Cobrar 2 M a todos', immediate: true });
    if (a === 'debt_collector') opts.push({ k: 'a', txt: 'Cobrar 5 M (elige rival)', fn: () => onStart('debt') });
    if (a === 'sly_deal') opts.push({ k: 'a', txt: 'Robar una propiedad', fn: () => onStart('sly') });
    if (a === 'forced_deal') opts.push({ k: 'a', txt: 'Intercambiar propiedades', fn: () => onStart('forced') });
    if (a === 'deal_breaker') opts.push({ k: 'a', txt: 'Robar un set completo', fn: () => onStart('dealbreaker') });
    if (a === 'house' || a === 'hotel') opts.push({ k: 'a', txt: `Poner ${card.name} en un set`, fn: () => onStart('house') });
    if (a === 'just_say_no') opts.push({ k: 'jsn', txt: '(Solo como respuesta)', disabled: true });
    if (a === 'double_rent') opts.push({ k: 'dr', txt: '(Se usa junto a un Alquiler)', disabled: true });
  }
  if (bankable) opts.push({ k: 'bank', txt: `Guardar en el banco (${card.value} M)`, fn: onBank });

  return (
    <Sheet onClose={onClose} title={card.name}>
      {opts.map((o) => (
        <button
          key={o.k}
          className="btn btn-secondary sheet-btn"
          disabled={o.disabled}
          onClick={o.immediate ? onImmediate : o.fn}
        >
          {o.txt}
        </button>
      ))}
    </Sheet>
  );
}

function ColorPicker({ title, onClose, onPick }) {
  return (
    <Sheet onClose={onClose} title={title}>
      <div className="color-grid">
        {Object.entries(PROPERTY_GROUPS).map(([g, def]) => (
          <button key={g} className="color-chip" style={{ background: def.hex }} onClick={() => onPick(g)}>
            {def.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function RentFlow({ flow, me, hasDoubleRent, playsLeft, setFlow, onCancel, onConfirm }) {
  const card = flow.card;
  const groups = card.groups === 'any' ? Object.keys(me.properties) : card.groups;
  const [double, setDouble] = useState(false);

  if (!flow.group) {
    return (
      <Sheet onClose={onCancel} title="¿Color del alquiler?">
        {groups.length === 0 && <p className="muted">No tienes propiedades para cobrar alquiler.</p>}
        {groups.map((g) => (
          <button key={g} className="btn btn-secondary sheet-btn" onClick={() => setFlow({ ...flow, group: g })}>
            {label(g)}
          </button>
        ))}
      </Sheet>
    );
  }
  if (flow.needTarget && !flow.target) {
    return null; // el prompt de arriba pide tocar a un rival
  }
  return (
    <Sheet onClose={onCancel} title={`Alquiler de ${label(flow.group)}`}>
      {hasDoubleRent && playsLeft >= 2 && (
        <label className="dbl-toggle">
          <input type="checkbox" checked={double} onChange={(e) => setDouble(e.target.checked)} /> Doblar (usa Doble Alquiler)
        </label>
      )}
      <button
        className="btn btn-primary sheet-btn"
        onClick={() => onConfirm({ group: flow.group, ...(flow.target ? { targetId: flow.target } : {}), ...(double ? { _double: true } : {}) })}
      >
        Cobrar {flow.needTarget ? 'al rival elegido' : 'a todos'}
      </button>
    </Sheet>
  );
}

function DiscardOverlay({ hand, need, onCancel, onConfirm }) {
  const [sel, setSel] = useState(new Set());
  const toggle = (id) => {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  };
  return (
    <Sheet onClose={onCancel} title={`Descarta ${need} carta(s) para terminar`}>
      <div className="hand">
        {hand.map((c) => (
          <Card key={c.id} card={c} selected={sel.has(c.id)} onClick={() => toggle(c.id)} />
        ))}
      </div>
      <button className="btn btn-primary sheet-btn" disabled={sel.size !== need} onClick={() => onConfirm([...sel])}>
        Descartar y terminar
      </button>
    </Sheet>
  );
}

function PayOverlay({ game, me, amount, onPay }) {
  const [sel, setSel] = useState(new Set());
  const assets = [
    ...me.bank.map((c) => ({ ...c, from: 'bank' })),
    ...Object.entries(me.properties).flatMap(([g, pile]) =>
      pile.cards.map((c) => ({ ...c, from: 'prop', group: g, value: valueOfProp(c, g) })),
    ),
  ];
  const total = (ids) => assets.filter((a) => ids.has(a.id)).reduce((s, a) => s + (a.value || 0), 0);
  const worth = assets.reduce((s, a) => s + (a.value || 0), 0);
  const selValue = total(sel);
  const enough = selValue >= amount || sel.size === assets.length; // cubre o lo da todo
  const toggle = (id) => {
    const n = new Set(sel);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  };
  return (
    <div className="overlay">
      <div className="overlay-card">
        <h3>Debes pagar {amount} M</h3>
        <p className="muted">Seleccionadas: {selValue} M {worth < amount && '(no llegas: entrégalo todo)'}</p>
        <div className="pay-assets">
          {assets.length === 0 && <p className="muted">No tienes con qué pagar.</p>}
          {assets.map((a) => (
            <Card key={a.id} card={a} compact selected={sel.has(a.id)} onClick={() => toggle(a.id)} />
          ))}
        </div>
        <button className="btn btn-primary" disabled={!enough} onClick={() => onPay([...sel])}>
          Pagar
        </button>
      </div>
    </div>
  );
}

function ResponseOverlay({ pending, game, canSayNo, onSayNo, onAllow }) {
  const who = game.players.find((p) => p.id === pending.originator)?.nickname || 'Alguien';
  const names = { sly: 'Robo', forced: 'Trato Forzoso', dealbreaker: 'Trato Directo' };
  return (
    <div className="overlay">
      <div className="overlay-card">
        <h3>{who} juega {names[pending.effect] || 'una acción'} contra ti</h3>
        <p className="muted">¿Quieres anularla con ¡Ni Hablar!?</p>
        <div className="overlay-btns">
          <button className="btn btn-danger" disabled={!canSayNo} onClick={onSayNo}>
            ¡Ni Hablar!
          </button>
          <button className="btn btn-secondary" onClick={onAllow}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

function VictoryOverlay({ game, myId, onLeave }) {
  const winner = game.players.find((p) => p.id === game.winner);
  const iWon = game.winner === myId;
  return (
    <div className="overlay">
      <div className="overlay-card center">
        <h2>{iWon ? '🏆 ¡Has ganado!' : `🏆 Gana ${winner?.nickname}`}</h2>
        <p className="muted">Con 3 sets completos.</p>
        <div className="overlay-btns">
          <button className="btn btn-primary" onClick={() => (window.location.href = HUB_URL)}>
            Volver al hub
          </button>
          <button className="btn btn-ghost" onClick={onLeave}>Salir</button>
        </div>
      </div>
    </div>
  );
}

function PendingBanner({ game, myId }) {
  const p = game.pending;
  if (p.kind === 'payment') {
    const names = p.debtors.map((id) => game.players.find((q) => q.id === id)?.nickname).join(', ');
    return <div className="banner">Esperando el pago de {p.amount} M: {names}…</div>;
  }
  if (p.kind === 'response') {
    const who = game.players.find((q) => q.id === p.awaiting)?.nickname;
    return <div className="banner">Esperando la respuesta de {who}…</div>;
  }
  return null;
}

function TargetPrompt({ flow, onCancel }) {
  const msg = {
    debt: 'Toca al rival al que cobrar 5 M',
    sly: flow.target ? 'Toca una propiedad suelta del rival' : 'Toca al rival al que robar',
    forced: !flow.myCard ? 'Toca TU propiedad suelta' : !flow.target ? 'Toca al rival' : 'Toca su propiedad suelta',
    dealbreaker: flow.target ? 'Toca un set COMPLETO del rival' : 'Toca al rival',
    house: 'Toca TU set completo',
    rent: 'Toca al rival al que cobrar',
  }[flow.t];
  return (
    <div className="prompt-bar">
      <span>{msg}</span>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancelar</button>
    </div>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <strong>{title}</strong>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Valor de una propiedad para el pago (usa el valor del grupo).
function valueOfProp(card, group) {
  return PROPERTY_GROUPS[group]?.value ?? 0;
}
