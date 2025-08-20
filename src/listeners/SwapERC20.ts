import * as SwapContract from '@airswap/swap-erc20/build/contracts/SwapERC20.sol/SwapERC20.json'
import * as swapDeploys from '@airswap/swap-erc20/deploys.js'
import {
  chainNames,
  findTokenByAddress,
  findTokensBySymbol,
  getFullSwapERC20,
  getKnownTokens,
  getTokenInfo,
  toDecimalString,
} from '@airswap/utils'
import { commify } from '@ethersproject/units'
import { ethers } from 'ethers'
import {
  type Config,
  type SwapEventParams,
  defaultTokenInfo,
  getValue,
} from '../utils'

export class SwapERC20 {
  public provider: ethers.providers.Provider
  public publish: (type: string, params: any) => void
  public config: Config
  public contract: ethers.Contract

  public constructor(
    provider: ethers.providers.Provider,
    publish: (type: string, params: any) => void,
    config: Config
  ) {
    this.provider = provider
    this.publish = publish
    this.config = config
  }

  public async start() {
    const chainId = (await this.provider.getNetwork()).chainId
    if (!(String(chainId) in swapDeploys)) {
      throw new Error('SwapERC20: No contract deployed')
    }
    try {
      this.contract = new ethers.Contract(
        swapDeploys[String(chainId)],
        SwapContract.abi,
        this.provider
      )
      this.contract.on('SwapERC20', this.listener)
      this.config.logger.info(
        `${chainNames[chainId]} [${chainId}]: Listening SwapERC20 (${swapDeploys[chainId]}) for SwapERC20`
      )
    } catch (e: any) {
      this.config.logger.error(
        'SwapERC20: problem creating SwapERC20 event subscription',
        e.message
      )
    }
  }

  public async stop() {
    try {
      if (this.contract) this.contract.off('SwapERC20', this.listener)
    } catch (e: any) {
      this.config.logger.error(
        'SwapERC20: problem removing SwapERC20 event subscription',
        e.message
      )
    }
  }

  private listener = async (
    nonce: string,
    signerWallet: string,
    event: ethers.Event
  ) => {
    const chainId = (await this.provider.getNetwork()).chainId
    const { tokens } = await getKnownTokens(chainId)

    const transaction = await this.provider.getTransaction(
      event.transactionHash
    )
    const fullSwap = await getFullSwapERC20(
      event.transactionHash,
      this.provider
    )

    const signerTokenInfo =
      findTokenByAddress(fullSwap.signerToken, tokens) ||
      (await getTokenInfo(
        this.provider,
        chainId,
        fullSwap.signerToken,
        tokens
      )) ||
      defaultTokenInfo
    const senderTokenInfo =
      findTokenByAddress(fullSwap.senderToken, tokens) ||
      (await getTokenInfo(
        this.provider,
        chainId,
        fullSwap.senderToken,
        tokens
      )) ||
      defaultTokenInfo

    const signerAmount = ethers.BigNumber.from(fullSwap.signerAmount)
    const senderAmount = ethers.BigNumber.from(fullSwap.senderAmount)

    const signerUnits = toDecimalString(signerAmount, signerTokenInfo.decimals)
    const senderUnits = toDecimalString(senderAmount, senderTokenInfo.decimals)

    let swapValue = 0
    try {
      swapValue = await getValue(
        this.provider,
        chainId,
        signerTokenInfo,
        signerAmount,
        senderTokenInfo,
        senderAmount,
        USDT
      )
    } catch {
      this.config.logger.warn(
        'Could not get swap value',
        `[${chainId}] ${senderUnits} ${senderTokenInfo.symbol} → ` +
          `${signerUnits} ${signerTokenInfo.symbol}`
      )
    }

    const details: SwapEventParams = {
      name: event.event,
      hash: `${transaction?.hash}`,
      chainId,
      nonce,
      signerWallet,
      signerToken: fullSwap.signerToken,
      signerAmount: fullSwap.signerAmount,
      senderToken: fullSwap.senderToken,
      senderAmount: fullSwap.senderAmount,
      signerTokens: `${signerUnits} ${signerTokenInfo.symbol}`,
      senderTokens: `${senderUnits} ${senderTokenInfo.symbol}`,
      swapValue,
    }

    this.config.logger.info(
      `[${chainId}] ${details.senderTokens} → ${details.signerTokens} ($${commify(
        swapValue.toFixed(2)
      )})`
    )

    if (
      swapValue >= this.config.get('BIG_SWAP_MIN_VALUE') &&
      swapValue <= this.config.get('BIG_SWAP_MAX_VALUE') &&
      this.config.get('PUBLISHING')
    ) {
      this.publish('SwapERC20', details)
    }
  }
}

const USDT = findTokensBySymbol('USDT', [
  {
    chainId: 1,
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 6,
  },
  {
    chainId: 137,
    address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    name: 'Tether USD (PoS)',
    symbol: 'USDT',
    decimals: 6,
  },
  {
    chainId: 43114,
    address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    name: 'TetherToken',
    symbol: 'USDt',
    decimals: 6,
  },
  {
    chainId: 42161,
    address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 6,
  },
  {
    chainId: 56,
    address: '0x55d398326f99059fF775485246999027B3197955',
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 18,
  },
])
