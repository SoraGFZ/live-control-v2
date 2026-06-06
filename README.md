# Live Control App

Panel local para conectar TikTok LIVE, mapear triggers a acciones, mostrar un overlay web y despachar eventos a Minecraft o GTA V.

## Lo que ya hace

- Conecta a un live de TikTok por username usando `tiktok-live-connector`.
- Tambien puede conectarse con `sessionid` + `tt-target-idc` para enriquecer la sesion del live y mejorar acceso a datos autenticados.
- Guarda configuracion, acciones y triggers en `storage/live-control-state.json`.
- Expone un overlay web en `/overlay/<slug>`.
- Dispara alertas de overlay, TTS y audio desde el backend local.
- Emite eventos por WebSocket para bridges de Minecraft y GTA V.
- Intenta enviar comandos reales a Minecraft via RCON si completas host, port y password.
- Incluye un modulo de `Song Request` con Spotify para `!play`, `!skip` y `!quitar`.

## Scripts

- `npm run dev`: levanta backend en `http://127.0.0.1:5123` y frontend Vite.
- `npm run build`: compila el frontend.
- `npm run start`: ejecuta solo el backend y sirve `dist/` si ya existe.
- `npm run desktop:start`: compila el frontend y abre la app desktop con backend + bridge local.
- `npm run desktop:pack`: genera una carpeta desempaquetada de la beta desktop.
- `npm run desktop:dist`: genera el instalador de Windows (`NSIS`) para la beta cerrada.
- `npm run tunnel`: abre un tunel publico con ngrok hacia `http://localhost:5123`.
- `npm run tunnel:auth -- <TOKEN>`: guarda tu authtoken de ngrok una sola vez.
- `npm run tunnel:cloudflare`: abre un tunel publico con Cloudflare como alternativa.
- `npm run tunnel:localtunnel`: abre un tunel publico con LocalTunnel como alternativa.
- `npm run public`: compila la app, levanta el backend y abre el tunel publico.
- `npm run lint`: valida el codigo.

## Spotify Song Request

### Variables necesarias

Configura estas variables de entorno en tu backend o en Railway:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`

El `redirect_uri` debe apuntar a:

`https://TU-DOMINIO/api/music/spotify/callback`

Si vas a usar la app desktop empaquetada, agrega tambien este redirect en Spotify:

`http://127.0.0.1:5123/api/music/spotify/callback`

### Lo que ya hace

- Conectar tu cuenta de Spotify desde la seccion `Musica`.
- Mantener la sesion de Spotify entre reinicios del backend usando un archivo local del servidor.
- Configurar los comandos del chat:
  - `!play artista cancion`
  - `!skip`
  - `!quitar`
- Restringir esos comandos para `All users`, `Super Fans / Suscriptores` o `Mods`.
- Mantener una cola propia dentro de la app para poder moderar pedidos.
- Aplicar cooldown global, limite por usuario y limite total de cola.
- Limpiar cola pendiente e historial desde el panel.
- Enviar la siguiente cancion a Spotify cuando haya un dispositivo activo.
- Exponer un widget web en `/overlay/<slug>/song-request` para mostrar la cancion actual y lo que sigue.

### Limite importante

`!quitar` solo puede borrar canciones que todavia siguen en la cola de la app. Si una cancion ya fue enviada al queue interno de Spotify, la API oficial no deja removerla directamente.

## Flujo recomendado

1. Ejecuta `npm run dev`.
2. Abre la URL que te da Vite.
3. En `Operacion en vivo`, escribe tu username de TikTok y conecta el live.
4. Si necesitas datos autenticados, pega tambien `sessionid` y `tt-target-idc` antes de conectar.
5. Abre el link del overlay en otra ventana o usalo como browser source.
6. Crea o ajusta acciones y triggers.
7. Si quieres Minecraft real, completa el bloque de RCON en la seccion de overlay.
8. Si quieres GTA V o un mod propio, conectalo a `ws://127.0.0.1:5123/ws/gta`.

## Beta desktop cerrada

La beta desktop levanta tres cosas desde una sola app:

- panel local en `http://127.0.0.1:5123`
- backend Node
- bridge local para juegos

### Lo que hace en el primer arranque

- crea una carpeta propia en `AppData`
- copia tu `storage/` actual si existe, para no perder acciones ni triggers
- crea un `bridge-config.json` propio para la beta
- guarda logs en `AppData/.../runtime-logs`
- si ya habias iniciado sesion con TikTok dentro de la app desktop, intenta restaurar esas cookies

### Comandos utiles

1. `npm run desktop:start`
   abre la app desktop usando tu codigo actual y sirve para probar la beta sin empaquetar.
2. `npm run desktop:pack`
   arma la app en carpeta para revisar que todo abra bien.
3. `npm run desktop:dist`
   genera el instalador de Windows.

### Nota sobre Spotify en desktop

En modo desktop, la autorizacion de Spotify se abre en tu navegador y luego vuelve a una pagina de confirmacion local. La sesion queda guardada en la app, asi que despues puedes volver al panel y seguir sin reconectar cada vez.

### Nota sobre TikTok en desktop

Dentro de `Operacion en vivo` aparece el boton `Iniciar sesion con TikTok`. Ese flujo abre una ventana interna de TikTok y, cuando detecta `sessionid` + `tt-target-idc`, los guarda en tu perfil local para que no tengas que copiarlos manualmente.

## URL publica para LIVE Studio

1. Crea una cuenta gratis en [ngrok](https://ngrok.com/).
2. Copia tu authtoken desde [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken).
3. Ejecuta `npm run tunnel:auth -- <TU_TOKEN>` una sola vez.
4. Ejecuta `npm run public` o `npm run tunnel`.
5. Copia la URL `https://...ngrok-free.app` que te devuelve ngrok.
6. Pegala en `URL publica base` dentro del panel.
7. Usa la `URL publica` generada en la seccion `Overlay` para LIVE Studio.
8. Si ngrok falla en tu red, usa `npm run tunnel:cloudflare` o `npm run tunnel:localtunnel` como fallback.

## Hosting real recomendado

Para este proyecto conviene desplegar **la app completa** en un hosting que soporte Node, WebSockets y volumen persistente. La opcion mas alineada ahora mismo es **Railway**.

### Lo que ya queda preparado en este repo

- `Dockerfile`: construye el frontend y sirve el backend desde un solo contenedor.
- `railway.toml`: define build por Docker y healthcheck en `/api/status`.
- `LIVE_CONTROL_STORAGE_DIR`: permite montar un volumen real para `storage/`.

### Flujo sugerido en Railway

1. Sube este proyecto a GitHub.
2. En Railway crea un proyecto nuevo desde ese repo.
3. Railway detectara el `Dockerfile` y levantara el servicio web.
4. En el servicio, agrega un **Volume** montado en `/data`.
5. Define esta variable de entorno:
   `LIVE_CONTROL_STORAGE_DIR=/data`
6. Railway te dara una URL publica `https://...up.railway.app`.
7. Entra al panel desplegado y usa esa URL como base del overlay.

### Que ganas con esto

- URL real sin interstitial raro de tuneles gratis.
- WebSockets funcionando desde el mismo host.
- Estado y biblioteca media persistentes en el volumen.
- Menos dependencia de tu PC para el overlay.

## Bridge local para juegos

Con Railway, el overlay y el panel ya viven en internet. Para que **Minecraft o GTA V reaccionen en tu PC**, corre el bridge local desde esta misma carpeta.

### Archivos y comando

- Config ejemplo: `bridge-config.example.json`
- Config local real: `bridge-config.json`
- Arranque: `npm run bridge:start`

### Lo que hace el bridge

- Se conecta al backend publico por `wss` en `/ws/minecraft` y `/ws/gta`.
- Reexpone eventos para tus mods en local:
  - Minecraft local: `ws://127.0.0.1:6135`
  - GTA local: `ws://127.0.0.1:6136`
- Si activas `useRcon`, tambien ejecuta `commandText` directo por RCON.
- Si detecta ChaosMod, sube su catalogo al panel publico y tambien al panel local si esta corriendo en `http://127.0.0.1:5123`.
- Si Railway o tu backend local se reinician, el bridge vuelve a re-sincronizar el catalogo automaticamente.

### Flujo sugerido

1. Abre `bridge-config.json`.
2. Verifica que `serverBaseUrl` apunte a tu deploy de Railway.
3. Si usas `dashboardKey` en el panel, copia la misma clave aqui.
4. Si quieres comandos reales de Minecraft, activa `useRcon` y completa host, port y password.
5. Ejecuta `npm run bridge:start`.
6. Deja ese proceso abierto mientras juegas.

## ChaosMod para GTA V

Si tienes ChaosMod instalado en `C:\Program Files\Epic Games\GTAVEnhanced\chaosmod` (o GTAV estandar), el bridge local:

- Lee `effects.ini` para construir el catalogo sincronizado con el panel.
- Dispara efectos **directamente via HTTP** (puerto 8082) usando el endpoint compatible con StreamToEarn / ChaosMod built-in trigger. Esto es **silencioso** (sin menu visible, sin delay de teclas).

### Metodo actual (preferido y silencioso)

- `POST http://localhost:8082/trigger_effect` con el `effect_id`.
- No requiere atajos, no abre menus, respuesta casi instantanea.
- Funciona con ChaosMod Enhanced + integraciones S2E, y muchas builds modernas que exponen el trigger HTTP.

### Config en bridge-config.json (chaosmod)

```json
"chaosmod": {
  "enabled": true,
  "modPath": "C:\\Program Files\\Epic Games\\GTAVEnhanced\\chaosmod",
  "gtaProcessName": "GTA5_Enhanced"
}
```

Los campos viejos `preferShortcutTrigger`, `allowMenuFallback`, delays de menu/atajo siguen en config por compatibilidad pero actualmente el bridge prioriza el disparo HTTP directo.

### Notas

- Asegúrate que ChaosMod esté cargado en GTA y que el HTTP trigger esté disponible (algunas versiones lo exponen solo con ciertas flags o builds).
- El catalogo se sincroniza automaticamente al bridge y al panel.
- Si el HTTP directo falla, el efecto no se ejecuta (no hay fallback automatico a atajos en la version actual; se puede extender si es necesario para tu setup).
- Para replicar "cambiar vehiculo" como StreamToEarn: usa el efecto `misc_replacevehicle`.

**Documentacion legacy (socket/atajos/menu)**: Hay varios .md antiguos en la raiz sobre debug socket (31819) y atajos. El codigo actual usa HTTP directo 8082 como metodo principal silencioso. Esos docs estan obsoletos pero se mantienen por referencia historica.

## Proteccion basica

- `Clave del panel`: protege dashboard, APIs y websockets internos.
- `Clave publica del overlay`: agrega `?key=...` al link del overlay para que el browser source no quede abierto.
- Ambas claves se guardan de forma local en el estado del proyecto, asi que son proteccion basica, no seguridad enterprise.

## Bridges websocket

- Dashboard interno: `ws://127.0.0.1:5123/ws/app`
- Overlay: `ws://127.0.0.1:5123/ws/overlay`
- Minecraft / mod bridge: `ws://127.0.0.1:5123/ws/minecraft`
- GTA V / mod bridge: `ws://127.0.0.1:5123/ws/gta`

## Nota importante

`tiktok-live-connector` no es una API production-ready; es un proyecto de reverse engineering. Para uso local y prototipos esta base sirve bien, pero si luego quieres un producto mas robusto conviene evaluar un servicio o backend dedicado.
