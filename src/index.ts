import { chainNames, getReceiptUrl } from "@airswap/utils";
import { ethers } from "ethers";
import Discord from "./channels/discord";
import Twitter from "./channels/twitter";
import Config from "./config";
import * as listeners from "./listeners";
import {
	type EventParams,
	type SwapEventParams,
	createSocketProvider,
	getHTTPProviderURL,
} from "./utils";

const HTTP_PROVIDERS = [137, 43114];
const WS_PROVIDERS = [1];
const RECONNECT_DELAY = 10000;
const config = new Config();
const channels = [new Discord(config), new Twitter(config)];
const networks: Record<number, ethers.providers.Provider> = {};

async function publish(type: string, evt: EventParams) {
	if (config.get("PUBLISHING")) {
		try {
			switch (type) {
				case "SwapERC20":
					channels.map(async (channel) => {
						await channel.publishSwap(evt as SwapEventParams);
						config.logger.info(
							`✅ [Big Swap] ${await channel.name()} ${getReceiptUrl(
								evt.chainId,
								evt.hash,
							)}`,
						);
					});
					break;
				default:
					channels.map(async (channel) => {
						await channel.publishEvent(evt);
						config.logger.info(
							`✅ [${evt.name} Event] ${await channel.name()} ${getReceiptUrl(
								evt.chainId,
								evt.hash,
							)}`,
						);
					});
					break;
			}
		} catch (e: any) {
			config.logger.error("[Publish Error]", e);
		}
	} else {
		config.logger.info(`🔕 [Muted] ${getReceiptUrl(evt.chainId, evt.hash)}`);
	}
}

async function start() {
	// Initialize channels
	for (const channel in channels) {
		await channels[channel].init();
	}
	// Create HTTP providers
	config.logger.info("Providers: HTTP", HTTP_PROVIDERS, "WS", WS_PROVIDERS);
	for (const chainId of HTTP_PROVIDERS) {
		networks[chainId] = new ethers.providers.JsonRpcProvider(
			getHTTPProviderURL(chainId, config.get("INFURA_PROVIDER_ID")),
		);
	}
	// Create WebSocket providers
	for (const chainId of WS_PROVIDERS) {
		networks[chainId] = createSocketProvider(
			chainId,
			config.get("INFURA_PROVIDER_ID"),
		);
	}
	// Start listeners on all networks
	for (const chainId of Object.keys(networks)) {
		for (const listenerName of Object.keys(listeners)) {
			networks[chainId][listenerName] = new listeners[listenerName](
				networks[chainId],
				publish,
				config,
			);
			try {
				await networks[chainId][listenerName].start();
			} catch (e: any) {
				config.logger.warn(
					`${chainNames[chainId]} [${chainId}]: ${listenerName}`,
					e.message,
				);
			}
		}
	}
}

async function stop() {
	for (const channel in channels) {
		await channels[channel]?.close();
	}
	for (const chainId of Object.keys(networks)) {
		for (const listenerName of Object.keys(listeners)) {
			await networks[chainId][listenerName]?.stop();
		}
	}
}

process.on("uncaughtException", (err) => {
	switch (err.message) {
		case "WebSocket was closed before the connection was established":
			config.logger.error(
				"WebSocket: Connection dropped, restarting in 10s...",
			);
			stop().then(() => setTimeout(start, RECONNECT_DELAY));
			break;
		case "getaddrinfo ENOTFOUND mainnet.infura.io":
			config.logger.error("INFURA: Cannot connect, restarting in 10s...");
			stop().then(() => setTimeout(start, RECONNECT_DELAY));
			break;
		case "getaddrinfo ENOTFOUND discord.com":
			config.logger.error("DISCORD: Cannot connect, restarting in 10s...");
			stop().then(() => setTimeout(start, RECONNECT_DELAY));
			break;
		default:
			config.logger.error(err.message, "restarting in 10s...");
			stop().then(() => setTimeout(start, RECONNECT_DELAY));
			break;
	}
});

start();
