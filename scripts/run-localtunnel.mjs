import localtunnel from 'localtunnel'
import { persistTunnelUrl, syncPublicUrl } from './tunnel-sync.mjs'

const tunnelPort = Number(process.env.TUNNEL_PORT || 5123)

console.log('Abriendo LocalTunnel (sin pagina "Visit Site" de ngrok)...')
console.log('Mantén Live Control abierto en el puerto 5123.')

try {
  const tunnel = await localtunnel({
    port: tunnelPort,
  })

  persistTunnelUrl(tunnel.url)
  console.log(`Public URL (LocalTunnel): ${tunnel.url}`)
  console.log('Copia esa URL en Overlay → URL publica base.')
  void syncPublicUrl(tunnel.url)

  const closeTunnel = async () => {
    tunnel.close()
    process.exit(0)
  }

  process.on('SIGINT', closeTunnel)
  process.on('SIGTERM', closeTunnel)

  tunnel.on('close', () => {
    process.exit(0)
  })

  tunnel.on('error', (error) => {
    console.error(`LocalTunnel fallo: ${error.message}`)
    process.exit(1)
  })

  process.stdin.resume()
} catch (error) {
  console.error(`No pude abrir LocalTunnel: ${error.message}`)
  process.exit(1)
}