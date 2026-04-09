# Live Control App

Panel local para conectar TikTok LIVE, mapear triggers a acciones, mostrar un overlay web y despachar eventos a Minecraft o GTA V.

## Lo que ya hace

- Conecta a un live de TikTok por username usando `tiktok-live-connector`.
- Guarda configuracion, acciones y triggers en `storage/live-control-state.json`.
- Expone un overlay web en `/overlay/<slug>`.
- Dispara alertas de overlay, TTS y audio desde el backend local.
- Emite eventos por WebSocket para bridges de Minecraft y GTA V.
- Intenta enviar comandos reales a Minecraft via RCON si completas host, port y password.

## Scripts

- `npm run dev`: levanta backend en `http://127.0.0.1:5123` y frontend Vite.
- `npm run build`: compila el frontend.
- `npm run start`: ejecuta solo el backend y sirve `dist/` si ya existe.
- `npm run tunnel`: abre un tunel publico con ngrok hacia `http://localhost:5123`.
- `npm run tunnel:auth -- <TOKEN>`: guarda tu authtoken de ngrok una sola vez.
- `npm run tunnel:cloudflare`: abre un tunel publico con Cloudflare como alternativa.
- `npm run tunnel:localtunnel`: abre un tunel publico con LocalTunnel como alternativa.
- `npm run public`: compila la app, levanta el backend y abre el tunel publico.
- `npm run lint`: valida el codigo.

## Flujo recomendado

1. Ejecuta `npm run dev`.
2. Abre la URL que te da Vite.
3. En `Operacion en vivo`, escribe tu username de TikTok y conecta el live.
4. Abre el link del overlay en otra ventana o usalo como browser source.
5. Crea o ajusta acciones y triggers.
6. Si quieres Minecraft real, completa el bloque de RCON en la seccion de overlay.
7. Si quieres GTA V o un mod propio, conectalo a `ws://127.0.0.1:5123/ws/gta`.

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
- Si detecta ChaosMod, sube su catalogo al panel y permite elegir efectos desde la UI.

### Flujo sugerido

1. Abre `bridge-config.json`.
2. Verifica que `serverBaseUrl` apunte a tu deploy de Railway.
3. Si usas `dashboardKey` en el panel, copia la misma clave aqui.
4. Si quieres comandos reales de Minecraft, activa `useRcon` y completa host, port y password.
5. Ejecuta `npm run bridge:start`.
6. Deja ese proceso abierto mientras juegas.

## ChaosMod para GTA V

Si tienes ChaosMod instalado en `C:\Program Files\Epic Games\GTAV\chaosmod`, el bridge local intenta leer:

- `configs/effects.ini`
- `configs/config.ini`

### Lo que hace

- Sincroniza el catalogo de efectos con el panel.
- Intenta habilitar el debug socket creando `chaosmod/.enabledebugsocket`.
- Prioriza el disparo directo por socket hacia ChaosMod para evitar animaciones visibles y errores de seleccion.
- Puede usar el menu interno del mod como fallback solo si activas `allowMenuFallback`.

### Importante

- La primera vez conviene recargar el mod o reiniciar el juego para que ChaosMod detecte `.enabledebugsocket`.
- Si el debug socket no abre, el bridge ahora falla de forma segura por defecto en vez de navegar el menu visual y disparar otro efecto.
- Si aun asi quieres el comportamiento viejo, puedes poner `"allowMenuFallback": true` en `bridge-config.json`.
- Solo en ese modo fallback, el bridge usa `EnableDebugMenu=1`, asume que el selector arranca arriba y puede desincronizarse si mueves el menu a mano.

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
