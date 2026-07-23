# Shopping List

Lista de la compra compartida en familia: sincronización en tiempo real entre dispositivos, PWA instalable en Android e iOS, 100% gratuita, sin publicidad, privada.

**Stack:** Angular (PWA con Angular Service Worker) · Supabase (Postgres + Auth + Realtime) · Row Level Security · Cloudflare Pages.

Especificación completa (modelo de datos, requisitos, criterios de aceptación, orden de construcción por etapas) en [`docs/ai-source-of-truth.md`](docs/ai-source-of-truth.md). Documento de planificación previo en [`docs/planning.md`](docs/planning.md). Manual de trabajo para desarrollo asistido por IA en [`CLAUDE.md`](CLAUDE.md).

## Configuración local

1. Copia `.env.example` a `.env` y rellena las claves de tu proyecto de Supabase:

   ```bash
   cp .env.example .env
   ```

   ```
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_KEY=tu-clave-publishable
   ```

2. Instala dependencias:

   ```bash
   npm install
   ```

`src/environments/environment.ts` y `environment.development.ts` se generan automáticamente a partir de `.env` antes de arrancar o compilar (`scripts/generate-env.js`); no se editan a mano ni se versionan.

## Desarrollo

```bash
npm start
```

Abre `http://localhost:4200/`. La app se recarga automáticamente al modificar el código fuente.

## Build

```bash
npm run build
```

Genera los artefactos de producción en `dist/`.

## Tests

```bash
npm test
```

Ejecuta la suite de Vitest a través de Angular CLI.

## Lint

```bash
npm run lint
```
