import type { ethers } from "ethers";
import type Config from "../config";
import { Contract } from "./Contract";

import * as DelegateContract from "@airswap/delegate/build/contracts/Delegate.sol/Delegate.json";
import * as delegateDeploys from "@airswap/delegate/deploys.js";
import * as PoolContract from "@airswap/pool/build/contracts/Pool.sol/Pool.json";
import * as poolDeploys from "@airswap/pool/deploys.js";
import * as RegistryContract from "@airswap/registry/build/contracts/Registry.sol/Registry.json";
import * as registryDeploys from "@airswap/registry/deploys.js";
import * as StakingContract from "@airswap/staking/build/contracts/Staking.sol/Staking.json";
import * as stakingDeploys from "@airswap/staking/deploys.js";

export * from "./SwapERC20";

export class Registry extends Contract {
	constructor(
		provider: ethers.providers.Provider,
		publish: (type: string, params: any) => void,
		config: Config,
	) {
		super(
			"Registry",
			[
				"SetServerURL",
				"AddTokens",
				"RemoveTokens",
				"AddProtocols",
				"RemoveProtocols",
			],
			registryDeploys,
			RegistryContract.abi,
			provider,
			publish,
			config,
		);
	}
}

export class Delegate extends Contract {
	constructor(
		provider: ethers.providers.Provider,
		publish: (type: string, params: any) => void,
		config: Config,
	) {
		super(
			"Delegate",
			["DelegateSwap", "SetRule", "UnsetRule"],
			delegateDeploys,
			DelegateContract.abi,
			provider,
			publish,
			config,
		);
	}
}

export class Staking extends Contract {
	constructor(
		provider: ethers.providers.Provider,
		publish: (type: string, params: any) => void,
		config: Config,
	) {
		super(
			"Staking",
			["Transfer"],
			stakingDeploys,
			StakingContract.abi,
			provider,
			publish,
			config,
		);
	}
}

export class Pool extends Contract {
	constructor(
		provider: ethers.providers.Provider,
		publish: (type: string, params: any) => void,
		config: Config,
	) {
		super(
			"Pool",
			["Enable", "Withdraw"],
			poolDeploys,
			PoolContract.abi,
			provider,
			publish,
			config,
		);
	}
}
