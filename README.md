# Content Factory — Guía de Setup

## Qué es esto

Un sistema completo de producción de contenido con 3 partes:

1. **Bot de Telegram** — Le mandás tweets/artículos/ideas y te devuelve guiones listos para grabar
2. **Dashboard web** — Tablero visual para gestionar el pipeline (pendientes → por grabar → grabados → subidos)
3. **Motor de análisis** — Cargás métricas de TikTok y la IA detecta patrones de qué funciona y qué no

## Setup paso a paso

### 1. Crear el bot de Telegram (2 minutos)

1. Abrí Telegram y buscá `@BotFather`
2. Mandá `/newbot`
3. Elegí un nombre (ej: "Content Factory")
4. Elegí un username (ej: `mi_content_factory_bot`)
5. BotFather te da un **token**. Guardalo.

### 2. Obtener tu API key de Anthropic (2 minutos)

1. Andá a https://console.anthropic.com/
2. Creá una cuenta si no tenés
3. En API Keys → Create Key
4. Guardá la key

### 3. Obtener tu Telegram User ID (1 minuto)

Esto es para que SOLO vos puedas usar el bot.

1. En Telegram buscá `@userinfobot`
2. Mandá `/start`
3. Te responde con tu user ID (un número). Guardalo.

### 4. Deploy en Railway (5 minutos)

Railway es la opción más simple. Tiene free tier y después ~$5/mes.

1. Andá a https://railway.app/ y creá una cuenta (podés usar GitHub)
2. Click en "New Project" → "Deploy from GitHub repo"
3. Conectá tu GitHub y subí este código a un repo (o usá "Deploy from template" → Empty)
4. Si subiste a GitHub, Railway detecta el Dockerfile automáticamente
5. Andá a la pestaña **Variables** y agregá:

```
TELEGRAM_BOT_TOKEN=el_token_del_botfather
ANTHROPIC_API_KEY=tu_api_key
TELEGRAM_USER_ID=tu_user_id
PORT=3000
```

6. En **Settings** → **Networking** → genera un dominio público (ej: `content-factory-xxx.up.railway.app`)
7. Agregá estas variables más:

```
DASHBOARD_URL=https://content-factory-xxx.up.railway.app
WEBHOOK_URL=https://content-factory-xxx.up.railway.app
```

8. Railway deploya automáticamente. En 2-3 minutos tenés todo corriendo.

### 5. Persistencia de datos en Railway

Railway por defecto no persiste archivos entre deploys. Para la base de datos:

1. En tu proyecto de Railway, click en "New" → "Database" → "Volume"
2. Mount path: `/app/data`
3. Esto asegura que `factory.db` persista entre deploys

### Alternativa: Correr local

Si preferís probarlo local primero:

```bash
# Cloná o copiá los archivos
cd content-factory

# Instalá dependencias
npm install
npm install dotenv --save

# Creá .env con tus datos
cp .env.example .env
# Editá .env con tus tokens

# Arrancá
npm start
```

El bot funciona con polling en local (no necesita webhook).
El dashboard estará en http://localhost:3000

---

## Cómo se usa

### Flujo diario (5 minutos)

1. **Encontrás un tweet/artículo en inglés** que te parece interesante
2. **Lo pegás en el bot de Telegram** (copiá el texto, no la URL)
3. **El bot genera los guiones** con múltiples temas y ángulos
4. **Marcás los que te gustan** como "Por grabar" con el botón inline
5. **Grabás** cuando tengas tiempo
6. **Movés a "Grabado"** y después a "Subido"

### Flujo semanal (10 minutos)

1. **Exportá analytics de TikTok** (desde TikTok Studio → Analytics → Export)
2. **Mandá el CSV al bot** de Telegram
3. O cargá métricas manual: `/metricas ID views likes comments shares`
4. Cuando tengas 3+ videos con métricas: `/analizar`
5. La IA te dice qué hooks, estructuras y temas funcionan mejor
6. Usá esas insights para elegir mejor qué guiones grabar

### Comandos del bot

| Comando | Qué hace |
|---------|----------|
| (pegar texto) | Genera guiones del contenido |
| `/pendientes` | Lista guiones pendientes |
| `/porgrabar` | Lista guiones en cola |
| `/grabados` | Lista guiones grabados |
| `/subidos` | Lista guiones subidos |
| `/stats` | Resumen del pipeline |
| `/metricas ID v l c s` | Cargar métricas de un video |
| `/analizar` | Análisis IA de rendimiento |
| `/dashboard` | Link al tablero web |
| (enviar CSV) | Importar métricas de TikTok |

### Dashboard web

- **Pipeline**: Ves todos los guiones, filtrás por estado, clickeás para ver detalle y cambiar estado
- **Analytics**: Rendimiento por estructura, por tema, top performers, y último análisis IA

---

## Costos estimados

| Servicio | Costo |
|----------|-------|
| Railway (hosting) | ~$5/mes (free tier disponible) |
| Anthropic API | ~$3-8/mes (dependiendo del volumen) |
| **Total** | **~$8-13/mes** |

El costo de Anthropic depende de cuántos tweets/artículos proceses. Cada procesamiento usa ~2000-4000 tokens de output ($0.015-0.06 por generación con Sonnet). Si procesás 5 contenidos/día son ~$3-5/mes. El análisis semanal agrega ~$0.50/mes.

---

## Troubleshooting

**El bot no responde:**
- Verificá que el token de Telegram esté bien
- Verificá que tu user ID esté bien (si lo configuraste)
- Mirá los logs en Railway

**Los guiones son malos:**
- El prompt se puede mejorar editando `src/ai.js` → `SYSTEM_PROMPT`
- Cada ajuste que hagas al prompt mejora TODOS los guiones futuros

**Las métricas del CSV no matchean:**
- Asegurate de que cada guión subido tenga su URL de TikTok cargada
- El matching se hace por URL exacta

**Error de API de Anthropic:**
- Verificá que tu API key esté bien
- Verificá que tengas crédito en tu cuenta de Anthropic
