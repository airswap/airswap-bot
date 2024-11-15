import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import {
	ChainIds,
	getKnownTokens,
	wrappedNativeTokenAddresses,
} from "@airswap/utils";
import { Alchemy, Network } from "alchemy-sdk";
import { create, globSource } from "ipfs-http-client";
import last from "it-last";
import type { Config } from "../utils";

const ALCHEMY_NETWORKS = {
	1: Network.ETH_MAINNET,
	137: Network.MATIC_MAINNET,
	11155111: Network.ETH_SEPOLIA,
};

export const launch = async (args: string[], config: Config) => {
	const cwd = "/tmp";
	const folder = "airswap-marketplace";
	const stdio = "inherit";

	if (!fs.existsSync(`${cwd}/${folder}`)) {
		execSync(`git clone ${config.get("REPO_URL")}`, {
			cwd,
			stdio,
		});
		execSync("yarn", {
			cwd: `${cwd}/${folder}`,
			stdio,
		});
	} else {
		const res = execSync("git pull", {
			cwd: `${cwd}/${folder}`,
		}).toString();
		if (res !== "Already up to date.") {
			execSync("yarn", {
				cwd: `${cwd}/${folder}`,
				stdio,
			});
		}
	}

	console.log(`Deploying NFT Marketplace: ${args[0]} ${args[1]}`);

	const chainId = ChainIds[args[0].toUpperCase()];
	const collectionToken = args[1];
	const currencySymbol = args[2];

	// VALIDATE

	if (!chainId) {
		return `Sorry, I'm not familiar with the ${args[0]} chain. I support mainnet, polygon, and sepolia.`;
	}
	if (!(chainId in ALCHEMY_NETWORKS)) {
		return `Sorry, ${args[0]} is not supported yet. I support mainnet, polygon, and sepolia.`;
	}
	const settings = {
		apiKey: config.get(`ALCHEMY_KEYS_${chainId}`),
		network: ALCHEMY_NETWORKS[chainId],
	};
	const alchemy = new Alchemy(settings);
	let token: any;

	try {
		token = await alchemy.nft.getContractMetadata(collectionToken);
	} catch (e) {
		console.error(e);
		return `Sorry, I had a problem finding this token on ${args[0]}.`;
	}

	if (token.tokenType !== "ERC721" && token.tokenType !== "ERC1155") {
		return `Sorry, this token doesn't look like an ERC721 or ERC1155.`;
	}

	let currencyToken = {
		address: wrappedNativeTokenAddresses[chainId],
	};
	if (
		currencySymbol &&
		currencySymbol !== "ETH" &&
		currencySymbol !== "ETHER"
	) {
		const { tokens } = await getKnownTokens(chainId);
		currencyToken = tokens.find(
			(value) => value.symbol.toUpperCase() === currencySymbol.toUpperCase(),
		);

		if (!currencyToken) {
			return `Sorry, I had a problem finding ${args[2]} on ${args[0]}.`;
		}
	}

	// GEN ENV

	const env = [];
	const REACT_ENV = {
		REACT_APP_CHAIN_ID: chainId,
		REACT_APP_CURRENCY_TOKEN: currencyToken.address,
		REACT_APP_COLLECTION_TOKEN: collectionToken,
		REACT_APP_COLLECTION_NAME: token.name,
		REACT_APP_ALCHEMY_API_KEY: settings.apiKey,
		REACT_APP_STORAGE_SERVER_URL: config.get("STORAGE_SERVER_URL"),
	};
	for (const prop in REACT_ENV) {
		env.push(`${prop}=${REACT_ENV[prop]}`);
	}
	fs.writeFileSync(`${cwd}/${folder}/.env`, env.join(os.EOL));

	// GEN BUILD

	execSync("yarn build", {
		cwd: `${cwd}/${folder}`,
		stdio,
	});

	// DEPLOY

	const api = await builder({
		infuraProjectId: config.get("INFURA_PROJECT_ID"),
		infuraProjectSecret: config.get("INFURA_PROJECT_SECRET"),
	});

	let cid: any;
	try {
		cid = await upload(api, {
			pin: true,
			path: `${cwd}/${folder}/build/`,
			pattern: "**/*",
		});
	} catch (e) {
		console.error(e);
		return "Sorry, there was a problem uploading to IPFS.";
	}

	const options = { method: "GET", headers: { accept: "application/json" } };

	const { owners } = await (
		await fetch(
			`https://eth-mainnet.g.alchemy.com/nft/v3/${settings.apiKey}/getOwnersForContract?contractAddress=${collectionToken}&withTokenBalances=false`,
			options,
		)
	).json();

	if (owners[0]) {
		return `Here ya go: ${config.get("IPFS_URL")}${cid}/#/profile/${owners[0]}`;
	}
	return `Here ya go: ${config.get("IPFS_URL")}${cid}`;
};

async function builder(options) {
	const { infuraProjectId, infuraProjectSecret, headers, timeout } = options;
	if (!infuraProjectId) {
		throw new Error("[infura] ProjectId is empty. (input `infuraProjectId`)");
	}

	if (!infuraProjectSecret) {
		throw new Error(
			"[infura] ProjectSecret is empty. (input `infuraProjectSecret`)",
		);
	}

	const token = Buffer.from(
		`${infuraProjectId}:${infuraProjectSecret}`,
	).toString("base64");

	return create({
		host: "ipfs.infura.io",
		port: "5001",
		protocol: "https",
		headers: {
			...headers,
			authorization: `Basic ${token}`,
		},
		timeout,
	});
}

async function upload(api, options) {
	const { path, pattern, pin } = options;
	const directory: any = await last(
		api.addAll(globSource(path, pattern), { pin, wrapWithDirectory: true }),
	);
	if (!directory.cid) throw new Error("Content hash is not found.");
	return directory.cid.toString();
}
