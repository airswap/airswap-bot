import { chainNames, getReceiptUrl } from "@airswap/utils";
import { ethers } from "ethers";
import type Config from "../config";

export class Contract {
	name: string;
	events: string[];
	provider: ethers.providers.Provider;
	publish: (type: string, params: any) => void;
	config: Config;
	contract: ethers.Contract;
	deploys: any;
	abi: any;

	constructor(
		name: string,
		events: string[],
		deploys: any,
		abi: any,
		provider: ethers.providers.Provider,
		publish: (type: string, params: any) => void,
		config: Config,
	) {
		this.name = name;
		this.events = events;
		this.provider = provider;
		this.publish = publish;
		this.config = config;
		this.deploys = deploys;
		this.abi = abi;
	}

	private listener = async (...args: any[]) => {
		const event: ethers.Event = args[args.length - 1];
		const chainId = (await this.provider.getNetwork()).chainId;
		this.publish(this.name, {
			name: event.event,
			hash: event.transactionHash,
			...args,
		});
		this.config.logger.trace(
			`[${chainId}] ${this.name}:${event.event}`,
			getReceiptUrl(chainId, event.transactionHash),
		);
	};

	async start() {
		const chainId = (await this.provider.getNetwork()).chainId;
		if (!(String(chainId) in this.deploys)) {
			throw new Error("No contract deployed");
		}
		this.contract = new ethers.Contract(
			this.deploys[String(chainId)],
			this.abi,
			this.provider,
		);
		for (const eventName of this.events) {
			this.contract.on(eventName, this.listener);
		}
		this.config.logger.info(
			`${chainNames[chainId]} [${chainId}]: Listening ${this.name} (${this.deploys[chainId]}) for ${this.events.join(
				", ",
			)}`,
		);
	}

	async stop() {
		try {
			for (const eventName of this.events) {
				if (this.contract) this.contract.off(eventName, this.listener);
			}
		} catch (e: any) {
			this.config.logger.error(
				`${this.name}: problem removing SwapERC20 event subscription`,
				e.message,
			);
		}
	}
}
