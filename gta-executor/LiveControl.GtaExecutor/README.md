# Live Control GTA Executor

## Arquitectura mínima

`bridge -> http://127.0.0.1:3095/commands -> cola local -> Tick -> accion en GTA`

## JSON de comandos

```json
{
  "command": "replace_vehicle",
  "actionName": "ReemplazarVehiculo",
  "payload": {
    "hash": "0x18606535"
  }
}
```

Tambien acepta:

```json
{
  "command": "replace_vehicle",
  "payload": {
    "model": "adder"
  }
}
```

o

```json
{
  "command": "replace_vehicle",
  "payload": {
    "vehicle": "zentorno"
  }
}
```

## Endpoint receptor

- `POST http://127.0.0.1:3095/commands`
- `GET http://127.0.0.1:3095/health`

## Estructura recomendada

```text
gta-executor/
  LiveControl.GtaExecutor/
    LiveControl.GtaExecutor.csproj
    LiveControlExecutor.cs
    README.md
```

## Instalacion minima

1. Compila `LiveControl.GtaExecutor.dll`.
2. Copia la DLL a:
   `C:\Program Files\Epic Games\GTAVEnhanced\scripts\`
3. Asegurate de tener `ScriptHookVDotNet3.dll` en la raiz del juego.
4. Arranca GTA.

## Probar rapido

```powershell
$body = @{
  command = 'replace_vehicle'
  actionName = 'ReemplazarVehiculo'
  payload = @{
    hash = '0x18606535'
  }
} | ConvertTo-Json -Depth 4

Invoke-WebRequest `
  -Uri 'http://127.0.0.1:3095/commands' `
  -Method POST `
  -ContentType 'application/json' `
  -Body $body
```

Si el jugador esta dentro de un vehiculo, el script lo reemplaza por el modelo indicado.
