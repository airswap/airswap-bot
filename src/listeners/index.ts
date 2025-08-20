import type { ethers } from 'ethers'
import type { Config } from '../utils'
import { Contract } from './Contract'

import * as DelegateContract from '@airswap/delegate/build/contracts/Delegate.sol/Delegate.json'
import * as delegateDeploys from '@airswap/delegate/deploys.js'
import * as PoolContract from '@airswap/pool/build/contracts/Pool.sol/Pool.json'
import * as poolDeploys from '@airswap/pool/deploys.js'
import * as RegistryContract from '@airswap/registry/build/contracts/Registry.sol/Registry.json'
import * as registryDeploys from '@airswap/registry/deploys.js'
import * as StakingContract from '@airswap/staking/build/contracts/Staking.sol/Staking.json'
import * as stakingDeploys from '@airswap/staking/deploys.js'
import { ADDRESS_ZERO } from '@airswap/utils'

export * from './SwapERC20'

export class Registry extends Contract {
  public constructor(
    provider: ethers.providers.Provider,
    publish: (type: string, params: any) => void,
    config: Config
  ) {
    super(
      'Registry',
      {
        SetServerURL: {
          description: 'A server URL has been set',
          params: ['staker', 'url'],
        },
        AddTokens: {
          description: 'A server has added tokens',
          params: ['staker', 'tokens'],
        },
        RemoveTokens: {
          description: 'A server has removed tokens',
          params: ['staker', 'tokens'],
        },
        AddProtocols: {
          description: 'A server has added protocols',
          params: ['staker', 'protocols'],
        },
        RemoveProtocols: {
          description: 'A server has removed protocols',
          params: ['staker', 'protocols'],
        },
      },
      registryDeploys,
      RegistryContract.abi,
      provider,
      publish,
      config
    )
  }
}

export class Delegate extends Contract {
  public constructor(
    provider: ethers.providers.Provider,
    publish: (type: string, params: any) => void,
    config: Config
  ) {
    super(
      'Delegate',
      {
        DelegateSwap: {
          description: 'A delegate swap has been completed',
          params: ['nonce', 'signer'],
        },
        SetRule: {
          description: 'A delegate rule has been set',
          params: [
            'senderWallet',
            'senderToken',
            'senderAmount',
            'signerToken',
            'signerAmount',
            'expiry',
          ],
        },
        UnsetRule: {
          description: 'A delegate rule has been unset',
          params: ['senderWallet', 'senderToken', 'signerToken'],
        },
      },
      delegateDeploys,
      DelegateContract.abi,
      provider,
      publish,
      config
    )
  }
}

export class Staking extends Contract {
  public constructor(
    provider: ethers.providers.Provider,
    publish: (type: string, params: any) => void,
    config: Config
  ) {
    super(
      'Staking',
      {
        Transfer: {
          description: (params: string[]) => {
            if (params[0] === ADDRESS_ZERO) {
              return 'A member has staked AST'
            }
            return 'A member has unstaked AST'
          },
          params: ['from', 'to', 'tokens'],
        },
      },
      stakingDeploys,
      StakingContract.abi,
      provider,
      publish,
      config
    )
  }
}

export class Pool extends Contract {
  public constructor(
    provider: ethers.providers.Provider,
    publish: (type: string, params: any) => void,
    config: Config
  ) {
    super(
      'Pool',
      {
        Enable: {
          description: 'A tree has been enabled',
          params: ['tree', 'root'],
        },
        Withdraw: {
          description: 'A withdraw has been completed',
          params: ['account', 'recipient', 'token', 'value', 'amount'],
        },
      },
      poolDeploys,
      PoolContract.abi,
      provider,
      publish,
      config
    )
  }
}
