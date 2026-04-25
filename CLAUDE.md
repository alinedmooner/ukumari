# Ukumari — Informe de continuación del proyecto

> Documento de handoff para Claude Code. Su propósito es entregar contexto suficiente para que un agente o desarrollador pueda continuar el proyecto sin necesidad de leer la conversación previa.

---

## 1. Resumen ejecutivo

Ukumari es una extensión de navegador (Chrome MV3 / Firefox MV2) ya publicada en la Chrome Web Store que mejora la accesibilidad web aplicando ajustes 100% client-side: tipografía escalable, temas para daltonismo, alto contraste, resaltado de enlaces, TTS y atajos de teclado. Cumple WCAG 2.2 AA en lo aplicable a su superficie.

El siguiente paso del proyecto es agregar una **capa de accesibilidad cognitiva universal**, alimentada por un LLM, capaz de:

- Reescribir el contenido textual de cualquier página en lenguaje claro.
- Simplificar la estructura visual del DOM (ocultar ruido, reorganizar jerarquías).
- Adaptar el contenido a perfiles del usuario: discapacidad cognitiva, TDAH, dislexia, baja alfabetización, adultos mayores.
- Generar resúmenes y descripciones contextuales.

Esto exige un backend que hoy no existe. Este documento define el stack, la arquitectura, la API y el plan de implementación.

---

## 2. Estado actual del proyecto

**Repositorio:** https://github.com/alinedmooner/ukumari

**Stack actual:**
- Vanilla JavaScript (~77%), CSS (~17%), HTML (~5%)
- Manifest V3 (Chrome) y MV2 con quirks (Firefox)
- Persistencia en `chrome.storage.sync`
- TTS vía `chrome.tts` con fallback a `speechSynthesis`
- Sin backend, sin telemetría, sin servidores externos

**Estructura relevante:**

```
web-accessibility-extension/
├── manifest.json (MV3)
├── manifest-firefox.json (MV2)
├── background/service-worker.js
├── content/
│   ├── content-script.js
│   ├── dom-injector.js
│   ├── floating-widget.js
│   └── styles/
├── popup/
├── options/
├── utils/
│   ├── storage.js
│   ├── tts.js
│   └── keyboard-nav.js
├── icons/
└── _locales/es/messages.json
```

**Funcionalidades en producción:**
- Widget flotante en cada página
- Escalado tipográfico 0.8x – 2.0x
- Temas: alto contraste, protanopia, deuteranopia, tritanopia
- Resaltado de enlaces y foco visible
- TTS al enfocar elementos
- Atajos: Alt+T, Alt+Plus, Alt+Minus
- Sincronización de configuración entre dispositivos

**Lo que NO existe todavía y este informe va a planificar:**
- Backend que procese contenido con LLM
- Capa de reescritura cognitiva
- Sistema de perfiles de usuario más allá del storage local
- Cuotas, autenticación y monetización
- Caché de resultados
- Telemetría opcional para mejora del modelo

---

## 3. Visión del backend

### 3.1 Objetivo del producto

La extensión deja de ser solo un panel de ajustes visuales y pasa a ser una **capa cognitiva** que reescribe contextualmente cualquier página según el perfil del usuario.

Casos de uso concretos:

- Una persona con discapacidad cognitiva entra a un sitio bancario y la extensión reescribe el contenido en lenguaje claro, oculta los banners promocionales y agranda los CTA principales.
- Una persona con TDAH lee un artículo largo y recibe una versión con jerarquía simplificada, párrafos más cortos y resumen al inicio.
- Una persona con dislexia obtiene la página con tipografía OpenDyslexic, mayor interlineado y reescritura con frases más cortas.
- Un adulto mayor pide explicación de un trámite gubernamental y recibe pasos numerados con vocabulario simple.

### 3.2 Modelo de monetización (impacta decisiones de arquitectura)

- **Free tier:** uso casero limitado, modelo open-weights barato (Llama 3.3 vía Workers AI o Groq).
- **Pro tier:** modelo de mayor calidad (Claude Haiku, GPT-4o-mini), más cuota mensual, perfiles avanzados.
- **B2B / Enterprise:** sitios web pagan licencia para integrar la capa nativa en sus dominios, opcionalmente con modelo self-hosted (Ollama / vLLM) por cumplimiento de privacidad. Casos: sitios obligados por la European Accessibility Act (vigente desde 2025) o legislación local.

La arquitectura debe permitir las tres modalidades sin reescritura.

---

## 4. Stack decidido

### 4.1 Backend principal

- **Framework:** Hono (TypeScript)
- **Runtime objetivo primario:** Cloudflare Workers
- **Base de datos:** Cloudflare D1 (SQLite gestionado) para perfiles, cuotas y telemetría agregada
- **Cache de reescrituras:** Cloudflare KV (clave: hash de contenido + perfil)
- **Almacenamiento opcional de blobs grandes:** Cloudflare R2
- **Inferencia primaria:** Cloudflare Workers AI (Llama 3.3, Mistral) para tier free
- **Inferencia secundaria:** Anthropic Claude Haiku para tier pro
- **Capa de abstracción de modelos:** Vercel AI SDK (`ai`) — permite intercambiar proveedor por configuración
- **Observabilidad y caché semántico:** Cloudflare AI Gateway

### 4.2 Justificaciones rápidas

- Hono porque es portable a Node, Bun, Deno, Vercel y Cloudflare sin cambiar el código. Permite ofrecer despliegue self-hosted al cliente enterprise.
- Cloudflare Workers porque tiene PoP en Bogotá y América Latina, free tier suficiente para uso open source, soporte nativo de SSE para streaming de tokens, y AI Gateway integrado.
- TypeScript en backend para mantener homogeneidad con la extensión y reducir fricción de contributors.
- Vercel AI SDK porque desacopla del proveedor: hoy Cloudflare, mañana OpenRouter, pasado mañana Ollama local.

### 4.3 Rutas alternativas si se descarta Cloudflare

- **Node + Fastify + Postgres + Redis:** despliegue tradicional en Fly.io, Railway o VPS. Apropiado para enterprise self-hosted.
- **Bun + Elysia:** rendimiento, pero ecosistema menos maduro.
- **FastAPI (Python):** apropiado solo si se planea pipeline de IA complejo (visión, embeddings personalizados, fine-tuning). Por ahora se descarta para mantener un único lenguaje.

---

## 5. Arquitectura propuesta

### 5.1 Diagrama lógico

```
┌─────────────────────────────────────────────────────────────┐
│                   Extensión Ukumari                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │
│  │ Widget     │  │ Content    │  │ DOM Extractor          │ │
│  │ Flotante   │  │ Script     │  │ (Readability.js)       │ │
│  └────────────┘  └────────────┘  └────────────────────────┘ │
│         │              │                    │               │
│         └──────────────┴────────────────────┘               │
│                        │                                    │
│              ┌─────────▼──────────┐                         │
│              │ API Client (fetch) │                         │
│              │ + SSE consumer     │                         │
│              └─────────┬──────────┘                         │
└────────────────────────┼────────────────────────────────────┘
                         │  HTTPS + JWT
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend Hono @ Cloudflare Workers              │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Auth & JWT   │  │ Rate limiter │  │ Profile manager  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Rewrite API  │  │ Cache (KV)   │  │ Quota tracker    │   │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘   │
│         │                                                   │
│         ▼                                                   │
│  ┌────────────────────────────────────────────────────┐     │
│  │  AI Gateway (caché semántico + observabilidad)     │     │
│  └────────────────────────────────────────────────────┘     │
│         │                                                   │
└─────────┼───────────────────────────────────────────────────┘
          │
          ▼
   ┌──────────────┬──────────────┬──────────────┐
   │ Workers AI   │ Anthropic    │ Ollama       │
   │ (free tier)  │ (pro tier)   │ (self-host)  │
   └──────────────┴──────────────┴──────────────┘
```

### 5.2 Decisiones de diseño no negociables

1. **Nunca mandar HTML completo al modelo.** La extensión extrae el contenido principal con Readability.js (o equivalente) y envía solo texto + metadatos de estructura. El backend devuelve el texto reescrito y la extensión lo aplica al DOM.

2. **Streaming desde el primer endpoint.** SSE (Server-Sent Events) por defecto. La extensión muestra el texto a medida que llega.

3. **Caché por hash de contenido + hash de perfil.** Si el usuario A y el usuario B tienen el mismo perfil "lenguaje claro" y visitan la misma página, comparten resultado. El hash incluye versión del prompt para invalidar cuando se mejore.

4. **Rate limiting por usuario y por IP.** Sin esto, un solo usuario puede arruinar la economía del free tier.

5. **Modelo intercambiable por configuración.** Variable de entorno o columna en DB que define qué modelo usa cada plan.

6. **Privacidad por defecto.** No se almacena el contenido original de las páginas más allá del caché de resultados (que tiene TTL). No hay logs con texto identificable. Telemetría agregada solo (contadores).

---

## 6. Estructura del repositorio propuesta

Pasamos a un monorepo con la extensión existente y el nuevo backend.

```
ukumari/
├── packages/
│   ├── extension/                    # Código actual movido aquí
│   │   ├── manifest.json
│   │   ├── manifest-firefox.json
│   │   ├── background/
│   │   ├── content/
│   │   ├── popup/
│   │   ├── options/
│   │   ├── utils/
│   │   │   ├── storage.js
│   │   │   ├── tts.js
│   │   │   ├── keyboard-nav.js
│   │   │   ├── api-client.js         # NUEVO: cliente del backend
│   │   │   └── content-extractor.js  # NUEVO: Readability wrapper
│   │   └── _locales/
│   │
│   ├── backend/                      # NUEVO
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point Hono
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── rewrite.ts
│   │   │   │   ├── profile.ts
│   │   │   │   └── health.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── rate-limit.ts
│   │   │   │   └── cors.ts
│   │   │   ├── services/
│   │   │   │   ├── ai/
│   │   │   │   │   ├── provider.ts       # Abstracción
│   │   │   │   │   ├── workers-ai.ts
│   │   │   │   │   ├── anthropic.ts
│   │   │   │   │   └── ollama.ts
│   │   │   │   ├── cache.ts
│   │   │   │   ├── quota.ts
│   │   │   │   └── prompts/
│   │   │   │       ├── plain-language.ts
│   │   │   │       ├── adhd-friendly.ts
│   │   │   │       ├── dyslexia-friendly.ts
│   │   │   │       └── elder-friendly.ts
│   │   │   ├── db/
│   │   │   │   ├── schema.ts
│   │   │   │   └── migrations/
│   │   │   └── lib/
│   │   │       ├── hash.ts
│   │   │       └── jwt.ts
│   │   ├── wrangler.toml
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                       # NUEVO: tipos compartidos
│       ├── types/
│       │   ├── profile.ts
│       │   ├── api.ts
│       │   └── content-block.ts
│       └── package.json
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── self-hosting.md
│   └── prompts.md
├── .github/workflows/
├── package.json                      # Workspaces
├── pnpm-workspace.yaml
├── README.md
└── CLAUDE.md                          # Este documento
```

---

## 7. Modelo de datos

### 7.1 Tablas (D1 / SQLite)

**`users`**
- `id` TEXT PRIMARY KEY (uuid v7)
- `email` TEXT UNIQUE NULL (null para usuarios anónimos con device_id)
- `device_id` TEXT UNIQUE NOT NULL (generado en la extensión)
- `plan` TEXT NOT NULL DEFAULT 'free'  // free | pro | enterprise
- `created_at` INTEGER
- `updated_at` INTEGER

**`profiles`**
- `id` TEXT PRIMARY KEY
- `user_id` TEXT REFERENCES users(id)
- `name` TEXT NOT NULL
- `preset` TEXT NOT NULL  // plain_language | adhd | dyslexia | elder | custom
- `params` JSON  // sobrescritura fina del preset
- `is_active` BOOLEAN
- `created_at` INTEGER

**`quota_usage`** (rolling window mensual)
- `user_id` TEXT
- `period` TEXT  // YYYY-MM
- `tokens_in` INTEGER
- `tokens_out` INTEGER
- `requests` INTEGER
- PRIMARY KEY (user_id, period)

**`enterprise_domains`** (para licencias B2B)
- `domain` TEXT PRIMARY KEY
- `org_id` TEXT
- `api_key_hash` TEXT
- `model_override` TEXT NULL
- `monthly_quota` INTEGER

### 7.2 KV (caché de reescrituras)

- Clave: `rewrite:v{prompt_version}:{sha256(content)}:{sha256(profile)}`
- Valor: JSON con `rewritten_text`, `metadata`, `model_used`, `created_at`
- TTL: 30 días por defecto, configurable por plan

---

## 8. API REST

### 8.1 Convenciones

- Base URL: `https://api.ukumari.app/v1`
- Auth: `Authorization: Bearer {jwt}` o `X-Device-Id: {uuid}` para anónimos
- Content type: `application/json`
- Streaming: `Accept: text/event-stream`

### 8.2 Endpoints

**`POST /v1/auth/anonymous`**
Crea usuario anónimo a partir de device_id. Devuelve JWT.
Request: `{ device_id: string }`
Response: `{ token: string, user: { id, plan } }`

**`POST /v1/auth/upgrade`**
Asocia email a usuario anónimo (para upgrade a Pro).
Request: `{ email, password }`
Response: `{ token, user }`

**`GET /v1/profiles`**
Lista perfiles del usuario.

**`POST /v1/profiles`**
Crea o actualiza perfil.
Request: `{ name, preset, params }`

**`POST /v1/rewrite`** ⭐ Endpoint principal
Reescribe un bloque de contenido según el perfil.
Request:
```json
{
  "profile_id": "uuid",
  "content_blocks": [
    { "id": "b1", "type": "heading", "level": 1, "text": "..." },
    { "id": "b2", "type": "paragraph", "text": "..." },
    { "id": "b3", "type": "list", "items": ["...", "..."] }
  ],
  "page_metadata": {
    "url_hash": "sha256...",
    "lang": "es",
    "domain_category": "banking"
  },
  "stream": true
}
```
Response (SSE):
```
event: block
data: { "id": "b1", "rewritten": "...", "from_cache": true }

event: block
data: { "id": "b2", "rewritten_chunk": "..." }

event: done
data: { "tokens_in": 320, "tokens_out": 180, "model": "@cf/meta/llama-3.3" }
```

**`GET /v1/quota`**
Devuelve uso actual y límite del plan.

**`POST /v1/feedback`**
Permite al usuario reportar mala reescritura. Necesario para mejorar prompts.
Request: `{ block_id, rating: -1|0|1, reason?: string }`

**`GET /v1/health`**
Liveness probe.

---

## 9. Flujo end-to-end de una reescritura

1. Usuario activa el perfil "Lenguaje claro" en el widget flotante.
2. `content-extractor.js` corre Readability.js sobre el documento, obtiene bloques estructurados.
3. `api-client.js` llama a `POST /v1/rewrite` con SSE.
4. Backend valida JWT, chequea cuota mensual.
5. Para cada bloque calcula `cache_key = hash(content) + hash(profile_normalizado)`.
6. Si hay hit en KV, emite `event: block` con `from_cache: true`.
7. Si miss, agrupa bloques en batch y llama al proveedor de IA correspondiente al plan.
8. Stream tokens al cliente vía SSE.
9. Al terminar cada bloque, lo guarda en KV con TTL.
10. Actualiza `quota_usage` (operación atómica).
11. La extensión reemplaza el texto en el DOM preservando los handlers, IDs y atributos `aria-*`.

**Importante:** la sustitución en el DOM debe preservar el árbol original. Solo se reemplazan los `Text` nodes hijos, nunca elementos enteros, para no romper event listeners ni JS de la página.

---

## 10. Plan de implementación por fases

### Fase 0 — Refactor del repo (1–2 días)
- Migrar a monorepo con pnpm workspaces.
- Mover extensión actual a `packages/extension`.
- Crear `packages/shared` con tipos.
- Agregar tooling: prettier, eslint, tsconfig base.
- Garantizar que la extensión sigue funcionando idéntica.

### Fase 1 — Backend mínimo (3–5 días)
- Bootstrap Hono + Cloudflare Workers.
- `wrangler.toml` con bindings de D1 y KV.
- Schema D1 con migraciones (`drizzle-orm` recomendado).
- Auth anónima por device_id, JWT.
- Endpoint `POST /v1/rewrite` con un solo preset (plain_language).
- Inferencia con Workers AI (Llama 3.3).
- SSE streaming.
- Caché en KV.

### Fase 2 — Integración con extensión (2–3 días)
- `content-extractor.js` con Readability.js.
- `api-client.js` con consumidor SSE.
- Lógica de reemplazo de texto en el DOM (preservando estructura).
- UI en widget flotante para activar/desactivar capa cognitiva.
- Indicador de "procesando" accesible (anuncio aria-live).

### Fase 3 — Perfiles y cuota (2–3 días)
- Tablas `profiles` y `quota_usage`.
- CRUD de perfiles.
- Rate limiting por user/IP.
- Página de opciones extendida con presets + sliders de personalización.
- Visualización de cuota en el widget.

### Fase 4 — Tier Pro (3–4 días)
- Integración con Anthropic Claude Haiku.
- Auth con email/password (Cloudflare Access o lib propia con argon2).
- Stripe para suscripciones.
- Upgrade/downgrade flow.
- Dashboard mínimo en sitio web (Astro o Next).

### Fase 5 — Self-hosted enterprise (4–5 días)
- Adapter Ollama.
- Build alternativo Node + Postgres (mismo código Hono).
- Docker Compose para deployment local.
- Documentación de self-hosting.
- API key management para domains enterprise.

### Fase 6 — Calidad y polish (continuo)
- Telemetría agregada (sin contenido).
- A/B testing de prompts.
- Tests E2E con Playwright.
- Auditoría de accesibilidad del propio backend (errores accesibles).
- i18n del backend (mensajes de error localizados).

---

## 11. Variables de entorno y secretos

### Backend (Cloudflare Workers — `wrangler.toml` + secrets)

```
# Públicas (vars)
ENVIRONMENT=production
DEFAULT_MODEL=@cf/meta/llama-3.3-70b-instruct
PROMPT_VERSION=1
CACHE_TTL_SECONDS=2592000

# Secretos (wrangler secret put)
JWT_SECRET=...
ANTHROPIC_API_KEY=...
STRIPE_SECRET_KEY=...
AI_GATEWAY_TOKEN=...

# Bindings (wrangler.toml)
[[d1_databases]]
binding = "DB"
database_name = "ukumari-prod"

[[kv_namespaces]]
binding = "REWRITE_CACHE"

[ai]
binding = "AI"
```

### Extensión

```
API_BASE_URL=https://api.ukumari.app/v1
```

(Inyectado en build time, no como secreto.)

---

## 12. Estrategia de costos y caché

### 12.1 Estimación gruesa (free tier)

- Página típica: 500–1500 tokens de input, 400–1200 de output.
- Costo Workers AI Llama 3.3: aprox $0.59 / millón input + $0.79 / millón output (verificar precios actuales antes de lanzar).
- Sin caché: usuario activo (~50 páginas/día) cuesta ~$0.05/día = $1.50/mes.
- Con caché 70% hit rate: ~$0.45/mes por usuario activo.

**Conclusión:** el free tier es viable solo si el caché funciona bien. Si no, hay que limitar a 10–20 reescrituras gratis al mes.

### 12.2 Reglas de caché

- TTL 30 días para contenido público.
- Bypass de caché para contenido autenticado (detectado por hint de la extensión: cookies presentes en el dominio).
- Invalidación global al cambiar `PROMPT_VERSION`.
- AI Gateway suma caché semántico para inputs muy similares pero no idénticos.

### 12.3 Rate limits sugeridos

- Free: 50 req/día, 1000 req/mes, 100k tokens/mes.
- Pro: 1000 req/día, sin tope mensual blando.
- Enterprise: por contrato.

---

## 13. Pruebas y validación

### 13.1 Backend
- Unit tests con Vitest (Hono lo soporta nativamente).
- Integration tests con Miniflare (simula entorno Workers).
- Contract tests del SSE (mock client que valida formato de eventos).

### 13.2 Extensión
- Tests unitarios del extractor de contenido.
- Tests E2E con Playwright en páginas reales (Wikipedia, Medium, sitios gov.co).
- Prueba manual con NVDA, VoiceOver y JAWS para garantizar que la reescritura no rompe la lectura asistida.

### 13.3 Calidad de la IA
- Banco de páginas de referencia con reescrituras "doradas" hechas por humanos.
- Métricas: legibilidad (Flesch-Huerta para español), preservación de hechos (no alucinar), longitud relativa.
- Feedback de usuarios (thumbs up/down) almacenado y agregado.

### 13.4 Accesibilidad del propio producto
- Lighthouse, axe DevTools, WAVE en cada release.
- Auditoría WCAG 2.2 AA del widget y de la página de opciones.

---

## 14. Despliegue

### 14.1 Backend
- CI/CD con GitHub Actions.
- `wrangler deploy` en push a `main`.
- Entornos separados: `dev`, `staging`, `production` con bindings y secretos distintos.
- Migraciones D1 con `wrangler d1 migrations apply`.

### 14.2 Extensión
- Build con esbuild o vite (para soportar imports y TypeScript progresivamente).
- Empaquetado automatizado para Chrome Web Store y Firefox AMO.
- Versionado semántico atado a tags git.

### 14.3 Self-hosted
- Imagen Docker `ukumari/backend:latest` que corre el mismo código Hono sobre Node con Postgres en lugar de Workers/D1.
- Helm chart opcional para Kubernetes.

---

## 15. Decisiones pendientes (lo que falta resolver antes de codear)

1. **Nombre de la cuenta y dominio definitivo.** ¿`ukumari.app`? ¿`ukumari.org`?
2. **Licencia.** GPL-3.0 ya está en el repo. Confirmar si se mantiene o se evalúa AGPL para que B2B SaaS competidores deban contribuir.
3. **Modelo de auth.** ¿Construir propio con argon2 o usar Cloudflare Access / WorkOS?
4. **Stripe vs LemonSqueezy** para cobros (LemonSqueezy es Merchant of Record, simplifica impuestos internacionales).
5. **Handling de páginas autenticadas.** ¿Permitirlas con caché por usuario, o bloquearlas y avisar?
6. **Política de retención.** Definir explícitamente qué se guarda y por cuánto. Necesario para política de privacidad.
7. **i18n del modelo.** Empezar solo en español o multiidioma desde el día uno.
8. **Prompts de presets.** Necesitan iteración con usuarios reales de cada perfil; idealmente con asociaciones de discapacidad cognitiva, dislexia, etc.

---

## 16. Tareas inmediatas para Claude Code

Cuando se invoque a Claude Code en este repo, las primeras tareas a delegarle son, en orden:

1. **Migrar a monorepo.** Crear `pnpm-workspace.yaml`, mover el contenido actual a `packages/extension`, validar que la extensión carga sin cambios.
2. **Bootstrap del backend.** En `packages/backend`, crear proyecto Hono con `wrangler init`, configurar TypeScript, agregar `drizzle-orm` y migración inicial.
3. **Schema D1.** Crear tablas `users`, `profiles`, `quota_usage` con migraciones.
4. **Endpoint `POST /v1/auth/anonymous`** con generación de JWT.
5. **Endpoint `POST /v1/rewrite`** con un solo preset (plain_language), Workers AI, sin caché aún.
6. **SSE streaming** validado con un cliente de prueba.
7. **Caché KV.**
8. **Cliente en la extensión.** `api-client.js` con consumidor SSE y manejo de errores accesible.
9. **Integración en el widget flotante.** Toggle "Modo lenguaje claro" que dispara la reescritura.

A partir de ahí, seguir las fases 3–6 del plan.

---

## 17. Convenciones para Claude Code

- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`...).
- **Branches:** trabajar siempre en feature branches, PRs pequeños.
- **Tests primero** en el backend para los endpoints críticos.
- **Comentarios en español** salvo en código JSDoc/TSDoc que se mantiene en inglés por convención.
- **No introducir librerías sin justificarlas** en el PR; cada dependencia nueva en backend o extensión debe estar argumentada.
- **Accesibilidad como criterio de aceptación.** Todo PR que toque UI debe pasar axe DevTools sin nuevos errores.

---

## 18. Recursos y referencias

- WCAG 2.2 quick reference: https://www.w3.org/WAI/WCAG22/quickref/
- European Accessibility Act: https://employment-social-affairs.ec.europa.eu/policies-and-activities/social-protection-social-inclusion/persons-disabilities/european-accessibility-act_en
- Hono docs: https://hono.dev
- Cloudflare Workers AI: https://developers.cloudflare.com/workers-ai/
- Vercel AI SDK: https://sdk.vercel.ai/
- Mozilla Readability.js: https://github.com/mozilla/readability
- Repositorio actual: https://github.com/alinedmooner/ukumari

---

*Documento generado el 25 de abril de 2026 como handoff para continuación del proyecto Ukumari.*
