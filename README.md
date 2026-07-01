# Monopoly Deal — online (Game Hub, uso familiar)

Adaptación web multijugador en tiempo real del **juego de cartas del Monopoly**
(*Monopoly Deal*), **versión española con calles de Madrid**, para jugar 2–5 jugadores
en familia desde el **Hub familiar de juegos**. Mismo stack y arquitectura que *Assemble*.

> Proyecto **privado para uso familiar**. Adaptación casera; *Monopoly* y *Monopoly Deal*
> pertenecen a sus titulares. No publicar ni distribuir comercialmente.

## Estado del proyecto

- **Fase 1 — Acceso + Lobby + Salas + Integración Hub** ✅
- **Fase 2 — Motor de reglas (baraja de 106 cartas) + tests** ✅ (`npm test` → 34 tests)
- **Fase 3 — UI de partida + tiempo real (SSE)** ✅
- Fase 4 — Pulido / responsive (pendiente)

## Arquitectura

- **Frontend:** React + Vite, mobile-first, en español. Login SSO con `@neondatabase/auth`
  contra el proxy de auth del hub (mismas cuentas del hub).
- **Backend producción:** funciones serverless en `api/` (Vercel). Estado en **Neon
  Postgres** (una fila por sala: `code`, `state` jsonb, `version`, `status`) con
  concurrencia optimista (CAS). Tiempo real por **SSE** (`/api/rooms/[code]/stream`).
- **Backend dev (local, sin Neon):** `server/` Express + Socket.IO + store en memoria.
- **Motor de reglas:** módulo puro en `server/game/` (compartido). En Fase 1 es un **stub**.
- **Integración hub:** leer sala `GET {HUB_URL}/api/rooms/{code}`, devolver resultado
  `POST {HUB_URL}/api/rooms/{code}/result` con `Bearer HUB_RESULT_SECRET`.

## Requisitos

- Node.js 18 o superior.

## Configuración

```bash
cp .env.example .env         # dev local (socket.io)
# y/o .env.local para Vercel/Neon (DATABASE_URL, HUB_RESULT_SECRET, etc.)
```

Variables: ver `.env.example`.

## Ejecutar en desarrollo (local, sin Neon)

```bash
npm install
npm install --prefix client
npm run dev
```

- Frontend (Vite): http://localhost:5173
- API y Socket.IO en :3000 (Vite hace proxy).
- Panel de administración: http://localhost:5173/#admin

## Base de datos (Neon, producción)

Cuando exista `DATABASE_URL`:

```bash
node scripts/migrate.js   # crea la tabla "rooms" (idempotente)
```

## Producción (Vercel)

`vercel.json` compila el cliente y sirve `api/` como funciones serverless. El juego se
integra en el hub por subdominio (`monopoly.gamehub.family`) + rewrite en el hub.

## Estructura

```
api/       Funciones serverless (Vercel) + _lib (db, rooms, auth, hub, handler)
server/    Express + Socket.IO (dev local, estado en memoria)
  game/      motor de reglas (Fase 2; stub en Fase 1)
shared/    constantes + catálogo de cartas y calles (Monopoly Deal español)
client/    frontend React (Vite), mobile-first
scripts/   migración de la BD Neon
```

## Calles (Monopoly Madrid clásico)

Ver `shared/constants.js` (`PROPERTY_GROUPS`): 10 grupos de color con sus calles,
valor y escala de alquiler. Los precios en pesetas del tablero no aplican a Monopoly Deal.
