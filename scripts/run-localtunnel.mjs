import localtunnel from 'localtunnel'

const tunnelPort = Number(process.env.TUNNEL_PORT || 5123)

try {
  const tunnel = await localtunnel({
    port: tunnelPort,
  })

  console.log(`Public URL: ${tunnel.url}`)

  const closeTunnel = async () => {
    tunnel.close()
    process.exit(0)
  }

  process.on('SIGINT', closeTunnel)
  process.on('SIGTERM', closeTunnel)

  tunnel.on('close', () => {
    process.exit(0)
  })

  process.stdin.resume()
} catch (error) {
  console.error(`No pude abrir LocalTunnel: ${error.message}`)
  process.exit(1)
}
