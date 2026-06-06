using GTA;
using GTA.Math;
using GTA.Native;
using GTA.UI;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace LiveControl.GtaExecutor
{
    public sealed class LiveControlExecutor : Script
    {
        private const string VersionTag = "LIVECONTROL_BUILD_2026_04_20_TEST_A";
        private const string Prefix = "http://127.0.0.1:3095/";
        private const string LogFileName = "LiveControlExecutor.log";
        private const string RuntimeProofPath = "C:\\Users\\soraf\\Desktop\\livecontrol-runtime-proof.txt";
        private static readonly string GameRootPath =
            Directory.GetParent(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? AppDomain.CurrentDomain.BaseDirectory)?.FullName
            ?? AppDomain.CurrentDomain.BaseDirectory;
        private static readonly string GtavWebhookLogPath = Path.Combine(GameRootPath, "GTAVWebhook.log");
        private static readonly Regex ReplaceVehicleLogRegex = new Regex(
            @"Vehicle replaced with 0x([0-9A-Fa-f]+)",
            RegexOptions.Compiled
        );
        private static readonly string LogFilePath =
            Path.Combine(
                Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? AppDomain.CurrentDomain.BaseDirectory,
                LogFileName
            );
        private static readonly Random RandomGenerator = new Random();

        private readonly ConcurrentQueue<GtaCommandEnvelope> _queue = new ConcurrentQueue<GtaCommandEnvelope>();
        private readonly HttpListener _listener = new HttpListener();
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer
        {
            MaxJsonLength = int.MaxValue,
            RecursionLimit = 16
        };

        private CancellationTokenSource _cts;
        private int? _lastRandomVehicleHash;

        public LiveControlExecutor()
        {
            Tick += OnTick;
            Aborted += OnAborted;
            Interval = 0;

            Log("script cargado");
            WriteRuntimeProof();
            Notification.Show(VersionTag);

            try
            {
                StartListener();
                Notification.Show("Live Control Executor listo");
            }
            catch (Exception ex)
            {
                Log($"error de arranque del executor: {ex}");
                Notification.Show("Live Control Executor fallo al iniciar");
            }
        }

        private static void WriteRuntimeProof()
        {
            var assemblyLocation = Assembly.GetExecutingAssembly().Location;
            var baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
            var proofText =
                $"{VersionTag}{Environment.NewLine}" +
                $"DateTime.Now={DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}{Environment.NewLine}" +
                $"Assembly.GetExecutingAssembly().Location={assemblyLocation}{Environment.NewLine}" +
                $"AppDomain.CurrentDomain.BaseDirectory={baseDirectory}{Environment.NewLine}";

            File.WriteAllText(RuntimeProofPath, proofText, Encoding.UTF8);
        }

        private void StartListener()
        {
            try
            {
                Log($"intentando iniciar HttpListener");
                Log($"prefix usado: {Prefix}");

                _cts = new CancellationTokenSource();

                if (!_listener.Prefixes.Contains(Prefix))
                {
                    _listener.Prefixes.Add(Prefix);
                }

                _listener.Start();
                Log($"HttpListener iniciado correctamente en {Prefix}");
                Task.Run(() => ListenLoop(_cts.Token));
            }
            catch (Exception ex)
            {
                Log($"error al iniciar HttpListener en {Prefix}: {ex}");
                throw;
            }
        }

        private async Task ListenLoop(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested && _listener.IsListening)
            {
                HttpListenerContext context = null;

                try
                {
                    context = await _listener.GetContextAsync().ConfigureAwait(false);
                    _ = Task.Run(() => HandleContext(context), cancellationToken);
                }
                catch (ObjectDisposedException)
                {
                    Log("listen loop finalizado: listener disposed");
                    break;
                }
                catch (HttpListenerException ex)
                {
                    Log($"listen loop finalizado por HttpListenerException: {ex}");
                    break;
                }
                catch (Exception ex)
                {
                    Log($"listen error: {ex}");
                }
            }
        }

        private async Task HandleContext(HttpListenerContext context)
        {
            try
            {
                AddCorsHeaders(context.Response);

                if (context.Request.HttpMethod == "OPTIONS")
                {
                    context.Response.StatusCode = 200;
                    context.Response.Close();
                    return;
                }

                if (context.Request.HttpMethod == "GET" && context.Request.Url.AbsolutePath == "/health")
                {
                    Log($"health check recibido desde {context.Request.RemoteEndPoint}");
                    await WriteJson(context.Response, 200, new { success = true, queue = _queue.Count });
                    return;
                }

                if (context.Request.HttpMethod == "POST" && context.Request.Url.AbsolutePath == "/commands")
                {
                    string rawBody;
                    using (var reader = new StreamReader(context.Request.InputStream, context.Request.ContentEncoding ?? Encoding.UTF8))
                    {
                        rawBody = await reader.ReadToEndAsync().ConfigureAwait(false);
                    }

                    var command = _json.Deserialize<GtaCommandEnvelope>(rawBody);
                    if (command == null || string.IsNullOrWhiteSpace(command.command))
                    {
                        await WriteJson(context.Response, 400, new { success = false, error = "command requerido" });
                        return;
                    }

                    command.payload = command.payload ?? new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                    command.actionName = string.IsNullOrWhiteSpace(command.actionName) ? command.command : command.actionName;

                    _queue.Enqueue(command);
                    Log($"queued: {rawBody}");
                    await WriteJson(context.Response, 202, new { success = true, queued = command.command, queue = _queue.Count });
                    return;
                }

                await WriteJson(context.Response, 404, new { success = false, error = "endpoint no encontrado" });
            }
            catch (Exception ex)
            {
                Log($"http error: {ex}");
                if (context.Response.OutputStream.CanWrite)
                {
                    await WriteJson(context.Response, 500, new { success = false, error = ex.Message });
                }
            }
        }

        private void OnTick(object sender, EventArgs e)
        {
            var processed = 0;

            while (processed < 4 && _queue.TryDequeue(out var command))
            {
                try
                {
                    ExecuteCommand(command);
                }
                catch (Exception ex)
                {
                    Log($"execute error ({command.command}): {ex}");
                }

                processed++;
            }
        }

        private void ExecuteCommand(GtaCommandEnvelope command)
        {
            var normalized = (command.command ?? string.Empty).Trim().ToLowerInvariant();

            switch (normalized)
            {
                case "replace_vehicle":
                    ExecuteReplaceVehicle(command);
                    break;
                default:
                    Log($"unknown command: {normalized}");
                    break;
            }
        }

        private void ExecuteReplaceVehicle(GtaCommandEnvelope command)
        {
            ExecuteReplaceVehicleInternal(command, ResolveVehicleModel(command.payload), "replace_vehicle");
        }

        private void ExecuteReplaceVehicleInternal(GtaCommandEnvelope command, Model model, string commandName)
        {
            var playerPed = Game.Player?.Character;
            if (playerPed == null || !playerPed.Exists() || playerPed.IsDead)
            {
                Log($"{commandName} skipped: player ped invalido o muerto");
                Notification.Show($"{commandName}: player invalido");
                return;
            }

            Log($"{commandName} start: action={command.actionName}");
            Notification.Show($"{commandName} start");

            var currentVehicle = playerPed.IsInVehicle() ? playerPed.CurrentVehicle : null;
            var currentVehicleExists = currentVehicle != null && currentVehicle.Exists();
            var seat = currentVehicleExists ? ResolveSeatForPed(currentVehicle, playerPed) : VehicleSeat.Driver;
            var usingExplicitModel = model != null;
            if (model == null)
            {
                var randomHash = GetRandomVehicleHashFromObservedPool(currentVehicleExists ? (int?)currentVehicle.Model.Hash : null);
                if (randomHash.HasValue)
                {
                    model = new Model(randomHash.Value);
                    Log($"{commandName} modelo random pool: 0x{randomHash.Value:X8}");
                    Notification.Show($"{commandName}: modelo random 0x{randomHash.Value:X8}");
                }
            }

            if (model == null)
            {
                Log($"{commandName} skipped: sin modelo explicito y sin pool observado disponible");
                Notification.Show($"{commandName}: sin modelo ni pool");
                return;
            }

            Log($"{commandName} modelo resuelto: 0x{model.Hash:X8} ({(usingExplicitModel ? "explicito" : "pool")})");
            Notification.Show($"{commandName} modelo: 0x{model.Hash:X8}");

            if (!model.IsInCdImage || !model.IsVehicle)
            {
                Log($"{commandName} skipped: model invalid for vehicle (0x{model.Hash:X8})");
                Notification.Show($"{commandName}: modelo invalido");
                return;
            }

            if (!model.Request(1500))
            {
                Log($"{commandName} skipped: model request timeout (0x{model.Hash:X8})");
                Notification.Show($"{commandName}: timeout cargando modelo");
                return;
            }

            model.RequestCollision(1500);

            var sourcePosition = currentVehicleExists ? currentVehicle.Position : playerPed.Position;
            var sourceHeading = currentVehicleExists ? currentVehicle.Heading : playerPed.Heading;
            var sourceVelocity = currentVehicleExists ? currentVehicle.Velocity : playerPed.Velocity;
            var sourceEngineRunning = currentVehicleExists && currentVehicle.IsEngineRunning;
            var sourceEngineHealth = currentVehicleExists ? currentVehicle.EngineHealth : 1000f;
            var sourceBodyHealth = currentVehicleExists ? currentVehicle.BodyHealth : 1000f;
            var spawnPosition = currentVehicleExists
                ? sourcePosition + currentVehicle.UpVector * 0.75f
                : playerPed.Position + playerPed.ForwardVector * 6.0f + new Vector3(0f, 0f, 0.5f);

            Log($"{commandName} branch: {(currentVehicleExists ? "en vehiculo" : "a pie")}");
            Notification.Show(currentVehicleExists ? $"{commandName}: reemplazando vehiculo actual" : "REPLACE A PIE EJECUTADO");

            var newVehicle = World.CreateVehicle(model, spawnPosition, sourceHeading);
            if (newVehicle == null || !newVehicle.Exists())
            {
                Log($"{commandName} spawn fail: World.CreateVehicle returned null");
                Notification.Show($"{commandName}: spawn fail");
                model.MarkAsNoLongerNeeded();
                return;
            }

            newVehicle.IsPersistent = true;
            newVehicle.Heading = sourceHeading;
            newVehicle.Velocity = sourceVelocity;
            newVehicle.IsEngineRunning = sourceEngineRunning;
            newVehicle.EngineHealth = Math.Max(sourceEngineHealth, 300f);
            newVehicle.BodyHealth = Math.Max(sourceBodyHealth, 300f);
            newVehicle.PlaceOnGround();
            newVehicle.IsEngineRunning = true;

            Log($"{commandName} spawn ok: handle={newVehicle.Handle}");
            Notification.Show("VEHICULO CREADO");

            TryWarpPedIntoVehicle(playerPed, newVehicle, seat);

            if (!IsPedInTargetVehicle(playerPed, newVehicle))
            {
                Log($"{commandName} warp fail: newHandle={newVehicle.Handle}");
                Notification.Show("WARP FAIL");
                if (newVehicle.Exists())
                {
                    newVehicle.Delete();
                }
                model.MarkAsNoLongerNeeded();
                return;
            }

            Log($"{commandName} warp ok: newHandle={newVehicle.Handle}");
            Notification.Show("WARP OK");

            if (currentVehicleExists && currentVehicle.Exists())
            {
                try
                {
                    currentVehicle.Delete();
                    Log($"{commandName} delete old vehicle ok: handle={currentVehicle.Handle}");
                    Notification.Show($"{commandName}: delete old vehicle ok");
                }
                catch (Exception ex)
                {
                    Log($"{commandName} delete old vehicle fail: {ex}");
                    Notification.Show($"{commandName}: delete old vehicle fail");
                }
            }

            newVehicle.IsPersistent = false;
            model.MarkAsNoLongerNeeded();

            Log($"{commandName} executed: {command.actionName} -> 0x{model.Hash:X8} newHandle={newVehicle.Handle}");
            Notification.Show($"{commandName} OK: 0x{model.Hash:X8}");
        }

        private static VehicleSeat ResolveSeatForPed(Vehicle vehicle, Ped ped)
        {
            if (vehicle == null || !vehicle.Exists() || ped == null || !ped.Exists())
            {
                return VehicleSeat.Driver;
            }

            if (vehicle.Driver != null && vehicle.Driver.Exists() && vehicle.Driver.Handle == ped.Handle)
            {
                return VehicleSeat.Driver;
            }

            for (var seatIndex = 0; seatIndex < vehicle.PassengerCapacity; seatIndex++)
            {
                var seat = (VehicleSeat)seatIndex;
                var seatPed = vehicle.GetPedOnSeat(seat);
                if (seatPed != null && seatPed.Exists() && seatPed.Handle == ped.Handle)
                {
                    return seat;
                }
            }

            return VehicleSeat.Driver;
        }

        private static void TryWarpPedIntoVehicle(Ped ped, Vehicle vehicle, VehicleSeat seat)
        {
            if (ped == null || !ped.Exists() || vehicle == null || !vehicle.Exists())
            {
                return;
            }

            for (var attempt = 0; attempt < 4; attempt++)
            {
                ped.Task.ClearAllImmediately();
                ped.SetIntoVehicle(vehicle, seat);
                Script.Wait(0);

                if (IsPedInTargetVehicle(ped, vehicle))
                {
                    return;
                }

                Function.Call(Hash.SET_PED_INTO_VEHICLE, ped.Handle, vehicle.Handle, (int)seat);
                Script.Wait(0);

                if (IsPedInTargetVehicle(ped, vehicle))
                {
                    return;
                }

                Function.Call(Hash.TASK_WARP_PED_INTO_VEHICLE, ped.Handle, vehicle.Handle, (int)seat);
                Script.Wait(0);

                if (IsPedInTargetVehicle(ped, vehicle))
                {
                    return;
                }
            }
        }

        private static bool IsPedInTargetVehicle(Ped ped, Vehicle vehicle)
        {
            return ped != null
                && ped.Exists()
                && vehicle != null
                && vehicle.Exists()
                && ped.IsInVehicle(vehicle);
        }

        private static Model ResolveVehicleModel(IDictionary<string, object> payload)
        {
            if (payload == null)
            {
                return null;
            }

            if (TryReadString(payload, "hash", out var hashValue))
            {
                var parsedHash = ParseHash(hashValue);
                if (parsedHash.HasValue)
                {
                    return new Model(parsedHash.Value);
                }
            }

            if (TryReadString(payload, "model", out var modelName) && !string.IsNullOrWhiteSpace(modelName))
            {
                return new Model(modelName);
            }

            if (TryReadString(payload, "vehicle", out var vehicleName) && !string.IsNullOrWhiteSpace(vehicleName))
            {
                return new Model(vehicleName);
            }

            return null;
        }

        private int? GetRandomVehicleHashFromObservedPool(int? currentVehicleHash)
        {
            var observedPool = LoadObservedVehiclePoolHashes();
            if (observedPool.Count == 0)
            {
                return null;
            }

            var candidates = new List<int>();
            foreach (var hash in observedPool)
            {
                if (currentVehicleHash.HasValue && hash == currentVehicleHash.Value)
                {
                    continue;
                }

                if (_lastRandomVehicleHash.HasValue && observedPool.Count > 1 && hash == _lastRandomVehicleHash.Value)
                {
                    continue;
                }

                candidates.Add(hash);
            }

            if (candidates.Count == 0)
            {
                candidates.AddRange(observedPool);
            }

            var selectedHash = candidates[RandomGenerator.Next(candidates.Count)];
            _lastRandomVehicleHash = selectedHash;
            return selectedHash;
        }

        private static List<int> LoadObservedVehiclePoolHashes()
        {
            var hashes = new List<int>();
            var seen = new HashSet<int>();

            try
            {
                if (!File.Exists(GtavWebhookLogPath))
                {
                    Log("replace_vehicle pool: GTAVWebhook.log no existe");
                    return hashes;
                }

                foreach (var line in File.ReadLines(GtavWebhookLogPath))
                {
                    var match = ReplaceVehicleLogRegex.Match(line);
                    if (!match.Success)
                    {
                        continue;
                    }

                    if (!uint.TryParse(match.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var parsed))
                    {
                        continue;
                    }

                    var hash = unchecked((int)parsed);
                    if (seen.Add(hash))
                    {
                        hashes.Add(hash);
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"replace_vehicle pool: error leyendo GTAVWebhook.log: {ex.Message}");
            }

            Log($"replace_vehicle pool observado cargado: {hashes.Count} hashes");
            return hashes;
        }

        private static bool TryReadString(IDictionary<string, object> payload, string key, out string value)
        {
            value = null;
            if (!payload.TryGetValue(key, out var raw) || raw == null)
            {
                return false;
            }

            value = Convert.ToString(raw, CultureInfo.InvariantCulture);
            return !string.IsNullOrWhiteSpace(value);
        }

        private static int? ParseHash(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            var trimmed = raw.Trim();
            if (trimmed.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
            {
                if (uint.TryParse(trimmed.Substring(2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var hex))
                {
                    return unchecked((int)hex);
                }
            }

            if (int.TryParse(trimmed, NumberStyles.Integer, CultureInfo.InvariantCulture, out var dec))
            {
                return dec;
            }

            return null;
        }

        private static void AddCorsHeaders(HttpListenerResponse response)
        {
            response.Headers["Access-Control-Allow-Origin"] = "*";
            response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
            response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
        }

        private async Task WriteJson(HttpListenerResponse response, int statusCode, object payload)
        {
            var json = _json.Serialize(payload);
            var bytes = Encoding.UTF8.GetBytes(json);

            response.StatusCode = statusCode;
            response.ContentType = "application/json";
            response.ContentEncoding = Encoding.UTF8;
            response.ContentLength64 = bytes.Length;

            await response.OutputStream.WriteAsync(bytes, 0, bytes.Length).ConfigureAwait(false);
            response.Close();
        }

        private void OnAborted(object sender, EventArgs e)
        {
            try
            {
                _cts?.Cancel();
                if (_listener.IsListening)
                {
                    _listener.Stop();
                }
                Log("executor abortado y listener detenido");
            }
            catch (Exception ex)
            {
                Log($"error al abortar executor: {ex}");
            }
        }

        private static void Log(string message)
        {
            var line = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}{Environment.NewLine}";
            File.AppendAllText(LogFilePath, line);
        }

        public sealed class GtaCommandEnvelope
        {
            public string command { get; set; }
            public string actionName { get; set; }
            public Dictionary<string, object> payload { get; set; }
        }
    }
}
