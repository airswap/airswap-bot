import * as RegistryContract from '@airswap/registry/build/contracts/Registry.sol/Registry.json'
import * as registryDeploys from '@airswap/registry/deploys.js'
import { ChainIds, ProtocolIds, chainNames } from '@airswap/utils'
import { Contract, ethers } from 'ethers'
import { type Config, getHTTPProviderURL } from '../utils'
import { inspect } from './inspect'

const USDC = 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const SENDER_AMOUNT = '100000000'
export const compliance = async (args: string[], config: Config) => {
  const chainName = args[0] || chainNames[ChainIds.MAINNET]
  const chainId = ChainIds[chainName?.toUpperCase()] || ChainIds.MAINNET
  const provider = new ethers.providers.JsonRpcProvider(
    getHTTPProviderURL(chainId, config.get('INFURA_PROJECT_ID'))
  )
  const Registry = new Contract(
    registryDeploys[String(chainId)],
    RegistryContract.abi,
    provider
  )
  const servers = []
  const stakers = await Registry.getStakersForProtocol(
    ProtocolIds.RequestForQuoteERC20
  )
  const urls = await Registry.getServerURLsForStakers(stakers)
  const tokens = []

  if (!urls.length) {
    return `[${chainNames[chainId]}] Compliance Report: RequestForQuoteERC20 (${ProtocolIds.RequestForQuoteERC20}): No Servers`
  }

  for (const i in stakers) {
    tokens[i] = await Registry.getTokensForStaker(stakers[i])

    const result = await inspect(
      [chainName, urls[i], USDC, USDT, SENDER_AMOUNT],
      config
    )
    servers.push(
      `**Inspecting** ${urls[i]}... (${tokens[i].length} supported tokens)\nsignerToken: ${USDC} / senderToken: ${USDT}\n${result}`
    )
  }

  return `[${chainNames[chainId]}] Compliance Report: RequestForQuoteERC20 (${
    ProtocolIds.RequestForQuoteERC20
  })

${servers.join('\n\n')}
`
}
