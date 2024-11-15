import * as swapDeploys from "@airswap/swap-erc20/deploys.js";
import { ChainIds, isValidOrderERC20 } from "@airswap/utils";
import * as jayson from "jayson";
import validUrl from "valid-url";
import type { Config } from "../utils";

const REQUEST_TIMEOUT = 10000;

export const inspect = async (args: string[], config: Config) => {
	const chainId = ChainIds[args[0].toUpperCase()] || ChainIds.MAINNET;
	const serverURL = args[1];
	const signerToken = args[2];
	const senderToken = args[3];
	const senderAmount = args[4];

	if (!validUrl.isUri(serverURL)) {
		throw new Error(
			"Invalid URL. Usage: inspect :chainName :serverURL :signerToken :senderToken :senderAmount",
		);
	}

	const EXEMPTIONS: { [key: string]: boolean } = {};
	if (config.get("EXEMPTIONS")) {
		for (const exemption of config.get("EXEMPTIONS").split(",")) {
			EXEMPTIONS[exemption] = true;
		}
	}

	const locatorUrl = new URL(serverURL);
	const options = {
		protocol: locatorUrl.protocol,
		hostname: locatorUrl.hostname,
		pathname: locatorUrl.pathname,
		port: locatorUrl.port,
		timeout: REQUEST_TIMEOUT,
	};

	let client: any;
	if (options.protocol === "http:") {
		client = jayson.Client.http(options);
	} else if (options.protocol === "https:") {
		client = jayson.Client.https(options);
	}
	return new Promise((resolve) => {
		const method = "getSignerSideOrderERC20";
		const params = {
			chainId,
			swapContract: swapDeploys[chainId],
			signerToken: signerToken,
			senderWallet: config.get("TEST_SENDER_WALLET"),
			senderToken: senderToken,
			senderAmount: senderAmount,
		};
		let serverStatus: any = null;

		if (serverURL in EXEMPTIONS) {
			resolve([true, "getSignerSideOrderERC20 🔵 Exempted"]);
		} else {
			client.request(
				method,
				params,
				(connectionError: any, serverError: any, result: any) => {
					let isValid = false;
					if (connectionError) {
						serverStatus = `🔴 Connection Error\n\n${JSON.stringify(connectionError)}`;
					} else if (serverError) {
						serverStatus = `🔴 Server Error\n\n${JSON.stringify(serverError)}`;
					} else if (result) {
						isValid = isValidOrderERC20(result);
						if (isValid) {
							serverStatus = "🟢 Valid Response";
						} else {
							serverStatus = `🔴 Invalid Response\n\n${JSON.stringify(result)}`;
						}
					}
					resolve(`getSignerSideOrderERC20 ${serverStatus}`);
				},
			);
		}
	});
};
