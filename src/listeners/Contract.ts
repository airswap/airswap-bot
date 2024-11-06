import { chainNames, getReceiptUrl } from "@airswap/utils";
import { ethers } from "ethers";
import type Config from "../config";
import type { EventParams } from "../utils";

type EventsSpec = {
	[key: string]: {
		description: string | ((params: string[]) => string);
		params: string[];
	};
};

export class Contract {
	name: string;
	events: EventsSpec;
	provider: ethers.providers.Provider;
	publish: (type: string, params: any) => void;
	config: Config;
	contract: ethers.Contract;
	deploys: any;
	abi: any;

	constructor(
		name: string,
		events: EventsSpec,
		deploys: any,
		abi: any,
		provider: ethers.providers.Provider,
		publish: (type: string, params: EventParams) => void,
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

	private handler = async (eventName: string, ...args: any[]) => {
		const chainId = (await this.provider.getNetwork()).chainId;
		const eventSpec = this.events[eventName];
		const evt = args[args.length - 1];
		const details = eventSpec.params.reduce(
			(acc: any, param: string, index: number) => {
				acc[param] = args[index];
				return acc;
			},
			{},
		);
		this.publish(this.name, {
			chainId,
			name: eventName,
			contract: this.name,
			hash: evt.transactionHash,
			description:
				typeof eventSpec.description === "function"
					? eventSpec.description(details)
					: eventSpec.description,
			details,
		});
		this.config.logger.trace(
			`[${chainId}] ${this.name}:${eventName}`,
			getReceiptUrl(chainId, evt.transactionHash),
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
		for (const eventName in this.events) {
			this.contract.on(eventName, this.handler);
		}
		this.config.logger.info(
			`${chainNames[chainId]} [${chainId}]: Listening ${this.name} (${this.deploys[chainId]}) for ${Object.keys(
				this.events,
			).join(", ")}`,
		);
	}

	async stop() {
		try {
			for (const eventName in this.events) {
				if (this.contract) this.contract.off(eventName, this.handler);
			}
		} catch (e: any) {
			this.config.logger.error(
				`${this.name}: problem removing SwapERC20 event subscription`,
				e.message,
			);
		}
	}
}
