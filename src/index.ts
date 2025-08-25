import { ChainIds, chainNames, getReceiptUrl } from '@airswap/utils'
import { ethers } from 'ethers'
import Discord from './channels/discord'
import Twitter from './channels/twitter'
import * as listeners from './listeners'
import {
  Config,
  type EventParams,
  type SwapEventParams,
  createSocketProvider,
  getHTTPProviderURL,
} from './utils'

const HTTP_PROVIDERS = [
  ChainIds.LINEA,
  ChainIds.POLYGON,
  ChainIds.BASE,
  ChainIds.AVALANCHE,
  ChainIds.BSC,
]
const WS_PROVIDERS = [ChainIds.MAINNET]

const config = new Config()
const channels = [new Discord(config), new Twitter(config)]
const networks: Record<number, ethers.providers.Provider> = {}
let restarting = false
let lastRestartTime = 0

async function publish(type: string, evt: EventParams) {
  if (config.get('PUBLISHING')) {
    try {
      switch (type) {
        case 'SwapERC20':
          channels.map(async (channel) => {
            await channel.publishSwap(evt as SwapEventParams)
            config.logger.info(
              `✅ [Big Swap] ${channel.name} ${getReceiptUrl(
                evt.chainId,
                evt.hash
              )}`
            )
          })
          break
        default:
          channels.map(async (channel) => {
            await channel.publishEvent(evt)
            config.logger.info(
              `✅ [${evt.name} Event] ${channel.name} ${getReceiptUrl(
                evt.chainId,
                evt.hash
              )}`
            )
          })
          break
      }
    } catch (e: any) {
      config.logger.error('[Publish Error]', e)
    }
  } else {
    config.logger.info(`🔕 [Muted] ${getReceiptUrl(evt.chainId, evt.hash)}`)
  }
}

async function startup() {
  config.logger.info('Starting...')
  // Initialize channels
  config.logger.info(`Channels: ${channels.map((c) => c.name).join(', ')}`)
  for (const channel in channels) {
    try {
      await channels[channel].init()
    } catch (e: any) {
      config.logger.error(
        `Failed to initialize ${channels[channel].name}:`,
        e.message
      )
      // If Discord rate limited, don't restart immediately
      if (e.message && e.message.includes('Not enough sessions remaining')) {
        config.logger.info(
          'Discord rate limited during startup, continuing with other services'
        )
        continue
      }
      throw e
    }
  }
  // Create HTTP providers
  config.logger.info('Providers: HTTP', HTTP_PROVIDERS, 'WS', WS_PROVIDERS)
  for (const chainId of HTTP_PROVIDERS) {
    networks[chainId] = new ethers.providers.JsonRpcProvider(
      getHTTPProviderURL(chainId, config.get('INFURA_PROJECT_ID'))
    )
  }
  // Create WebSocket providers
  for (const chainId of WS_PROVIDERS) {
    networks[chainId] = createSocketProvider(
      chainId,
      config.get('INFURA_PROJECT_ID'),
      config
    )
  }
  // Start listeners on all networks
  for (const chainId of Object.keys(networks)) {
    for (const listenerName of Object.keys(listeners)) {
      networks[chainId][listenerName] = new listeners[listenerName](
        networks[chainId],
        publish,
        config
      )
      try {
        await networks[chainId][listenerName].start()
      } catch (e: any) {
        config.logger.warn(
          `${chainNames[chainId]} [${chainId}]: ${listenerName}`,
          e.message
        )
      }
    }
  }
}

async function restart() {
  const now = Date.now()
  if (restarting) {
    config.logger.warn('Restart already in progress, ignoring restart request')
    return
  }
  if (now - lastRestartTime < config.get('MIN_RESTART_INTERVAL_MS')) {
    config.logger.warn(
      `Restart too soon after last restart, ignoring (${(now - lastRestartTime) / 1000}s ago)`
    )
    return
  }

  restarting = true
  lastRestartTime = now
  config.logger.info('Stopping...')

  try {
    // Close channels
    for (const channel in channels) {
      try {
        await channels[channel]?.close()
      } catch (e: any) {
        config.logger.error(`Error closing channel ${channel}:`, e.message)
      }
    }
    // Stop listeners
    for (const chainId of Object.keys(networks)) {
      for (const listenerName of Object.keys(listeners)) {
        try {
          await networks[chainId][listenerName]?.stop()
        } catch (e: any) {
          config.logger.error(
            `Error stopping listener ${listenerName} on chain ${chainId}:`,
            e.message
          )
        }
      }
    }
    // Clean up providers (especially WebSocket connections)
    for (const chainId of Object.keys(networks)) {
      const provider = networks[chainId]
      try {
        if (provider && typeof (provider as any).cleanup === 'function') {
          // WebSocket provider cleanup
          ;(provider as any).cleanup()
        }
        // Also try to destroy the provider if it has a destroy method
        if (provider && typeof (provider as any).destroy === 'function') {
          await (provider as any).destroy()
        }
      } catch (e: any) {
        config.logger.error(
          `Error cleaning up provider for chain ${chainId}:`,
          e.message
        )
      }
      // Remove reference to help garbage collection
      delete networks[chainId]
    }
  } catch (e: any) {
    config.logger.error('Error during restart cleanup:', e.message)
  }

  const reconnectDelayMs = config.get('RECONNECT_DELAY_MS')
  const reconnectDelaySeconds = reconnectDelayMs / 1000
  config.logger.info(`Done. Restarting in ${reconnectDelaySeconds}s.`)
  // Restart after delay
  setTimeout(() => {
    restarting = false
    startup().catch((e) => {
      config.logger.error('Error during startup:', e.message)
      // If startup fails, try again after delay
      setTimeout(() => restart(), config.get('RECONNECT_DELAY_MS'))
    })
  }, config.get('RECONNECT_DELAY_MS'))
}

process.on('uncaughtException', (err) => {
  config.logger.error(err)
  if (!restarting) {
    restart()
  }
})

// Graceful shutdown
async function shutdown() {
  config.logger.info('Received shutdown signal, cleaning up...')
  restarting = true

  try {
    // Close channels
    for (const channel in channels) {
      try {
        await channels[channel]?.close()
      } catch (e: any) {
        config.logger.error(`Error closing channel ${channel}:`, e.message)
      }
    }
    // Stop listeners
    for (const chainId of Object.keys(networks)) {
      for (const listenerName of Object.keys(listeners)) {
        try {
          await networks[chainId][listenerName]?.stop()
        } catch (e: any) {
          config.logger.error(
            `Error stopping listener ${listenerName} on chain ${chainId}:`,
            e.message
          )
        }
      }
    }
    // Clean up providers
    for (const chainId of Object.keys(networks)) {
      const provider = networks[chainId]
      try {
        if (provider && typeof (provider as any).cleanup === 'function') {
          ;(provider as any).cleanup()
        }
        if (provider && typeof (provider as any).destroy === 'function') {
          await (provider as any).destroy()
        }
      } catch (e: any) {
        config.logger.error(
          `Error cleaning up provider for chain ${chainId}:`,
          e.message
        )
      }
    }
    config.logger.info('Cleanup complete')
  } catch (e: any) {
    config.logger.error('Error during shutdown:', e.message)
  }

  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

startup()
