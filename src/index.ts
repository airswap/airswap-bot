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
const RECONNECT_DELAY = 10000

const config = new Config()
const channels = [new Discord(config), new Twitter(config)]
const networks: Record<number, ethers.providers.Provider> = {}
let restarting = false

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
    await channels[channel].init()
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
      config.get('INFURA_PROJECT_ID')
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
  restarting = true
  config.logger.info('Stopping...')
  // Close channels
  for (const channel in channels) {
    await channels[channel]?.close()
  }
  // Stop listeners
  for (const chainId of Object.keys(networks)) {
    for (const listenerName of Object.keys(listeners)) {
      await networks[chainId][listenerName]?.stop()
    }
  }
  config.logger.info(`Done. Restarting in ${RECONNECT_DELAY / 1000}s.`)
  // Restart after delay
  setTimeout(() => {
    restarting = false
    startup()
  }, RECONNECT_DELAY)
}

process.on('uncaughtException', (err) => {
  config.logger.error(err.message)
  if (!restarting) {
    restart()
  }
})

startup()
