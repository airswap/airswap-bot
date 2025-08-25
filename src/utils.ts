import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json'
import Quoter from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json'
import { computePoolAddress } from '@uniswap/v3-sdk'

import { Token } from '@uniswap/sdk-core'
import { FeeAmount } from '@uniswap/v3-sdk'

import path from 'node:path'
import bunyan from 'bunyan'
import * as dotenv from 'dotenv'
import fs from 'fs-extra'

dotenv.config()

import {
  type TokenInfo,
  apiUrls,
  chainLabels,
  toDecimalString,
} from '@airswap/utils'
import { ethers } from 'ethers'

const POOL_FACTORY_CONTRACT_ADDRESS =
  '0x1F98431c8aD98523631AE4a59f267346ea31F984'
const QUOTER_CONTRACT_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6'

const DEFAULT_BIG_SWAP_MIN_VALUE = 100000
const DEFAULT_BIG_SWAP_MAX_VALUE = 100000000
const DEFAULT_RECONNECT_DELAY_MS = 10000
const DEFAULT_MIN_RESTART_INTERVAL_MS = 30000
const DEFAULT_WEBSOCKET_PONG_TIMEOUT_MS = 15000
const DEFAULT_WEBSOCKET_KEEPALIVE_INTERVAL_MS = 7500
const DEFAULT_HTTP_REQUEST_TIMEOUT_MS = 10000
const DEFAULT_PROTOCOL_FEE_RATE = 0.0005
const DEFAULT_COMMAND_RESPONSE_DELAY_MS = 1000
const DEFAULT_DISCORD_BOT_USER_ID = '1072118621809156116'
const DEFAULT_DISCORD_EMBED_COLOR = 2847231

const STABLES = {
  USDT: 1,
  USDC: 1,
  BUSD: 1,
  DAI: 1,
}

const WETH = 'WETH'

export const defaultTokenInfo = {
  chainId: 0,
  name: '?',
  symbol: '?',
  decimals: 0,
  address: '?',
}

export const friendlyNames: any = {
  Ethereum: 'Ethereum',
  BSC: 'BNB Chain',
  Polygon: 'Polygon',
  Avalanche: 'Avalanche',
}

export type EventParams = {
  chainId: number
  name: string
  contract: string
  hash: string
  details?: Record<string, any>
}

export type SwapEventParams = EventParams & {
  timestamp: string
  nonce: string
  senderTokens: string
  signerTokens: string
  signerWallet: string
  signerToken: string
  signerAmount: string
  senderToken: string
  senderAmount: string
  swapValue: number
  feeValue: number
}

export type ReportDetails = {
  timeframe: string
  volume: string
}

export function getHTTPProviderURL(
  chainId: number,
  INFURA_PROJECT_ID: string
): string {
  let apiUrl = apiUrls[chainId]
  if (apiUrl.indexOf('infura.io') !== -1) {
    apiUrl += `/${INFURA_PROJECT_ID}`
  }
  return apiUrl
}

export function getWebSocketProviderURL(): string {
  return
}

export function minifyAddress(address: string) {
  const match = address.match(
    /^(0x[a-zA-Z0-9]{4})[a-zA-Z0-9]+([a-zA-Z0-9]{4})$/
  )
  if (!match) return address
  return `${match[1]}…${match[2]}`
}

export function formatNumber(num: number, precision = 2) {
  const map = [
    { suffix: 'T', threshold: 1e12 },
    { suffix: 'B', threshold: 1e9 },
    { suffix: 'M', threshold: 1e6 },
    { suffix: 'K', threshold: 1e3 },
    { suffix: '', threshold: 1 },
  ]
  const found = map.find((x) => Math.abs(num) >= x.threshold)
  if (found) {
    const formatted = (num / found.threshold).toFixed(precision) + found.suffix

    return formatted
  }
  return num
}

export function createSocketProvider(
  chainId: number,
  INFURA_PROJECT_ID: string,
  config: Config
) {
  const provider: ethers.providers.WebSocketProvider =
    new ethers.providers.WebSocketProvider(
      `wss://${chainLabels[
        chainId
      ].toLowerCase()}.infura.io/ws/v3/${INFURA_PROJECT_ID}`
    )
  let pingTimeout: NodeJS.Timeout
  let keepAliveInterval: ReturnType<typeof setInterval> | undefined

    // Add cleanup function to provider for proper disposal
  ;(provider as any).cleanup = () => {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval)
      keepAliveInterval = undefined
    }
    if (pingTimeout) {
      clearTimeout(pingTimeout)
      pingTimeout = undefined
    }
    if (
      provider._websocket &&
      provider._websocket.readyState === provider._websocket.OPEN
    ) {
      provider._websocket.close()
    }
  }

  provider._websocket.on('open', () => {
    keepAliveInterval = setInterval(() => {
      if (
        provider._websocket &&
        provider._websocket.readyState === provider._websocket.OPEN
      ) {
        provider._websocket.ping()
        pingTimeout = setTimeout(() => {
          if (provider._websocket) {
            provider._websocket.terminate()
          }
        }, config.get('WEBSOCKET_PONG_TIMEOUT_MS'))
      }
    }, config.get('WEBSOCKET_KEEPALIVE_INTERVAL_MS'))
  })

  provider._websocket.on('close', () => {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval)
      keepAliveInterval = undefined
    }
    if (pingTimeout) {
      clearTimeout(pingTimeout)
      pingTimeout = undefined
    }
    throw new Error('WebSocket closed')
  })

  provider._websocket.on('pong', () => {
    if (pingTimeout) {
      clearTimeout(pingTimeout)
      pingTimeout = undefined
    }
  })

  provider._websocket.on('error', () => {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval)
      keepAliveInterval = undefined
    }
    if (pingTimeout) {
      clearTimeout(pingTimeout)
      pingTimeout = undefined
    }
  })

  return provider
}

export async function getQuote(
  provider: ethers.providers.Provider,
  token: TokenInfo,
  tokenAmount: string,
  toToken: TokenInfo
): Promise<string> {
  const chainId = (await provider.getNetwork()).chainId
  const TOKEN_IN = new Token(
    Number(chainId),
    token.address,
    token.decimals,
    token.symbol,
    token.name
  )

  const TOKEN_OUT = new Token(
    Number(chainId),
    toToken.address,
    toToken.decimals,
    toToken.symbol,
    toToken.name
  )

  const quoterContract = new ethers.Contract(
    QUOTER_CONTRACT_ADDRESS,
    Quoter.abi,
    provider
  )
  const poolConstants = await getPoolConstants(provider, TOKEN_IN, TOKEN_OUT)

  const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
    poolConstants.token0,
    poolConstants.token1,
    poolConstants.fee,
    tokenAmount,
    0
  )

  return quotedAmountOut
}

async function getPoolConstants(
  provider: ethers.providers.Provider,
  tokenIn: Token,
  tokenOut: Token
): Promise<{
  token0: string
  token1: string
  fee: number
}> {
  const currentPoolAddress = computePoolAddress({
    factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
    tokenA: tokenIn,
    tokenB: tokenOut,
    fee: FeeAmount.MEDIUM,
  })

  const poolContract = new ethers.Contract(
    currentPoolAddress,
    IUniswapV3PoolABI.abi,
    provider
  )
  const [token0, token1, fee] = await Promise.all([
    poolContract.token0(),
    poolContract.token1(),
    poolContract.fee(),
  ])

  return {
    token0,
    token1,
    fee,
  }
}

export async function getValue(
  provider: ethers.providers.Provider,
  signerTokenInfo: TokenInfo,
  signerAmount: string,
  senderTokenInfo: TokenInfo,
  senderAmount: string,
  toToken: TokenInfo
): Promise<number> {
  if (signerTokenInfo.symbol in STABLES) {
    return Number(
      toDecimalString(signerAmount.toString(), signerTokenInfo.decimals)
    )
  }
  if (senderTokenInfo.symbol in STABLES) {
    return Number(
      toDecimalString(senderAmount.toString(), senderTokenInfo.decimals)
    )
  }
  if (signerTokenInfo.symbol === WETH) {
    return Number(
      toDecimalString(
        await getQuote(
          provider,
          signerTokenInfo,
          signerAmount.toString(),
          toToken
        ),
        toToken.decimals
      )
    )
  }
  if (senderTokenInfo.symbol === WETH) {
    return Number(
      toDecimalString(
        await getQuote(
          provider,
          senderTokenInfo,
          senderAmount.toString(),
          toToken
        ),
        toToken.decimals
      )
    )
  }
  try {
    return Number(
      toDecimalString(
        await getQuote(
          provider,
          signerTokenInfo,
          signerAmount.toString(),
          toToken
        ),
        toToken.decimals
      )
    )
  } catch {
    try {
      return Number(
        toDecimalString(
          await getQuote(
            provider,
            senderTokenInfo,
            senderAmount.toString(),
            toToken
          ),
          toToken.decimals
        )
      )
    } catch {}
    return 0
  }
}

const configPath = path.join(__dirname, 'config.json')
if (!fs.pathExistsSync(configPath)) {
  fs.outputJsonSync(configPath, {
    PUBLISHING: true,
    BIG_SWAP_MIN_VALUE: DEFAULT_BIG_SWAP_MIN_VALUE,
    BIG_SWAP_MAX_VALUE: DEFAULT_BIG_SWAP_MAX_VALUE,
  })
}
const config = fs.readJsonSync(configPath)

export class Config {
  public vars: any
  public logger: bunyan
  public constructor() {
    this.vars = {
      PUBLISHING: false,
      BIG_SWAP_MIN_VALUE: DEFAULT_BIG_SWAP_MIN_VALUE,
      BIG_SWAP_MAX_VALUE: DEFAULT_BIG_SWAP_MAX_VALUE,
      RECONNECT_DELAY_MS: DEFAULT_RECONNECT_DELAY_MS,
      MIN_RESTART_INTERVAL_MS: DEFAULT_MIN_RESTART_INTERVAL_MS,
      WEBSOCKET_PONG_TIMEOUT_MS: DEFAULT_WEBSOCKET_PONG_TIMEOUT_MS,
      WEBSOCKET_KEEPALIVE_INTERVAL_MS: DEFAULT_WEBSOCKET_KEEPALIVE_INTERVAL_MS,
      HTTP_REQUEST_TIMEOUT_MS: DEFAULT_HTTP_REQUEST_TIMEOUT_MS,
      PROTOCOL_FEE_RATE: DEFAULT_PROTOCOL_FEE_RATE,
      COMMAND_RESPONSE_DELAY_MS: DEFAULT_COMMAND_RESPONSE_DELAY_MS,
      DISCORD_BOT_USER_ID: DEFAULT_DISCORD_BOT_USER_ID,
      DISCORD_EMBED_COLOR: DEFAULT_DISCORD_EMBED_COLOR,
      DISCORD_TOKEN: '',
      DISCORD_SWAPS_CHANNEL: '',
      DISCORD_EVENTS_CHANNEL: '',
      TWITTER_APP_KEY: '',
      TWITTER_APP_SECRET: '',
      TWITTER_ACCESS_TOKEN: '',
      TWITTER_ACCESS_SECRET: '',
      SUBGRAPH_KEY: '',
      SUBGRAPH_ID: '',
      EXEMPTIONS: '',
      TEST_SENDER_WALLET: '',
      ALCHEMY_KEYS_1: '',
      ALCHEMY_KEYS_137: '',
      ALCHEMY_KEYS_8453: '',
      ALCHEMY_KEYS_11155111: '',
      REPO_URL: '',
      IPFS_URL: '',
      STORAGE_SERVER_URL: '',
      INFURA_PROJECT_ID: '',
      INFURA_PROJECT_SECRET: '',
    }

    for (const key in this.vars) {
      this.vars[key] = process.env[key] || config[key]
    }
    this.logger = bunyan.createLogger({
      name: 'airswapbot',
      streams: [
        {
          level: 'trace',
          stream: process.stdout,
        },
        {
          level: 'debug',
          path: '/var/tmp/airswapbot.json',
        },
      ],
    })
  }

  public get(key: string) {
    const value = this.vars[key]
    // Ensure numeric values are properly parsed
    if (typeof value === 'string' && !isNaN(Number(value))) {
      return Number(value)
    }
    return value
  }

  public set(key: string, value: any) {
    this.vars[key] = value
    if (key in config) {
      config[key] = value
      fs.writeJsonSync(configPath, config)
    }
  }
}
