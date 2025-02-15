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
	8453: Network.BASE_MAINNET,
	11155111: Network.ETH_SEPOLIA,
};

export const launch = async (args: string[], config: Config) => {
	const cwd = "/tmp";
	const folder = "airswap-marketplace";
	const stdio = "inherit";

	// Setup node version environment
	const nodeEnv = {
		...process.env,
		N_PREFIX: "/tmp/n",
		PATH: `/tmp/n/bin:${process.env.PATH}`,
		NODE_OPTIONS: "--max-old-space-size=384",
	};

	// Only download and install if the repository doesn't exist
	if (!fs.existsSync(`${cwd}/${folder}`)) {
		try {
			// Install Node.js
			execSync("npm install -g n --no-update-notifier", { stdio });
			execSync("n 18.16.0", { stdio, env: nodeEnv });

			// Get repository name from URL
			const repoPath = config
				.get("REPO_URL")
				.replace("https://github.com/", "")
				.replace(".git", "");

			const downloadUrl = `https://codeload.github.com/${repoPath}/zip/main`;

			execSync(`curl -s -L "${downloadUrl}" -o ${folder}.zip`, { cwd, stdio });
			execSync(`unzip -q ${folder}.zip`, { cwd, stdio });

			// Find the extracted folder name
			const extractedFolder = fs
				.readdirSync(cwd)
				.find((f) => f.endsWith("-main"));

			if (!extractedFolder) {
				throw new Error("Could not find extracted folder");
			}

			execSync(`mv "${extractedFolder}" "${folder}"`, { cwd, stdio });
			execSync(`rm ${folder}.zip`, { cwd, stdio });

			// Install dependencies
			await installDependencies(`${cwd}/${folder}`, nodeEnv);
		} catch (error) {
			console.error("Failed to download and install dependencies:", error);
			return "Failed to download and install dependencies";
		}
	}

	console.log(`Deploying NFT Marketplace: ${args[0]} ${args[1]}`);

	const chainId = ChainIds[args[0].toUpperCase()];
	const collectionToken = args[1];
	const currencySymbol = (args[2] || "ETH").toUpperCase();

	// VALIDATE

	if (!chainId) {
		return `Sorry, I'm not familiar with the ${args[0]} chain. I support mainnet, base, polygon, and sepolia.`;
	}
	if (!(chainId in ALCHEMY_NETWORKS)) {
		return `Sorry, ${args[0]} is not supported yet. I support mainnet, base, polygon, and sepolia.`;
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
		return `Sorry, this token doesn't look like an ERC721 or ERC1155. ${token.tokenType}`;
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

	try {
		await buildProject(`${cwd}/${folder}`, nodeEnv);
	} catch (error) {
		console.error("Build failed:", error);
		return "Sorry, there was a problem building the marketplace.";
	}

	// DEPLOY

	const api = await builder({
		infuraProjectId: config.get("INFURA_PROJECT_ID"),
		infuraProjectSecret: config.get("INFURA_PROJECT_SECRET"),
	});

	const buildDir = `${cwd}/${folder}/build`;
	let cid: any;
	try {
		if (!fs.existsSync(buildDir)) {
			throw new Error("Build directory not found");
		}

		// Log build directory contents for debugging
		console.log("Build directory contents:", fs.readdirSync(buildDir));

		cid = await upload(api, {
			pin: true,
			path: buildDir,
			pattern: "**/*", // Include all files and subdirectories
		});
	} catch (e) {
		console.error("Upload error:", e);
		return "Sorry, there was a problem uploading to IPFS.";
	}

	const options = { method: "GET", headers: { accept: "application/json" } };
	const ownerMetadataUrl = `https://${settings.network}.g.alchemy.com/nft/v3/${settings.apiKey}/getOwnersForContract?contractAddress=${collectionToken}&withTokenBalances=false`;

	const { owners } = await (await fetch(ownerMetadataUrl, options)).json();

	if (owners[0]) {
		return `Here ya go: ${config.get("IPFS_URL")}${cid}/#/profile/${owners[0]}`;
	}
	return `Here ya go: ${config.get("IPFS_URL")}${cid}`;
};

async function builder(options) {
	const { infuraProjectId, infuraProjectSecret, headers } = options;
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
		timeout: 300000, // 5 minutes timeout
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

async function installDependencies(buildPath: string, env: any) {
	const phases = [
		{
			// Install project dependencies first, including devDependencies
			cmd: "yarn install --production=false",
			options: {
				...env,
				NODE_OPTIONS: "--max-old-space-size=256",
				BABEL_ENV: "development",
				NODE_ENV: "development",
			},
		},
		{
			// Install missing build dependencies
			cmd: "yarn add autoprefixer@9.0.2 postcss-cli postcss-import@^12.0.1",
			options: {
				...env,
				NODE_OPTIONS: "--max-old-space-size=256",
				BABEL_ENV: "development",
				NODE_ENV: "development",
			},
		},
	];

	for (const phase of phases) {
		try {
			execSync(phase.cmd, {
				cwd: buildPath,
				stdio: "inherit",
				env: phase.options,
			});
		} catch (error) {
			console.error(`Installation failed: ${phase.cmd}`, error);
			throw error;
		}
	}
}

async function buildProject(buildPath: string, env: any) {
	const phases = [
		{
			// Clean and optimize before build
			cmd: "yarn cache clean && rm -rf node_modules/.cache",
			options: {
				...env,
				BABEL_ENV: "production",
				NODE_ENV: "production",
			},
		},
		{
			// Production build with optimizations
			cmd: "yarn build",
			options: {
				...env,
				NODE_OPTIONS: "--max-old-space-size=384",
				GENERATE_SOURCEMAP: "false",
				INLINE_RUNTIME_CHUNK: "false",
				IMAGE_INLINE_SIZE_LIMIT: "0",
				TSC_COMPILE_ON_ERROR: "true",
				SKIP_PREFLIGHT_CHECK: "true",
				DISABLE_ESLINT_PLUGIN: "true",
				BABEL_ENV: "production",
				NODE_ENV: "production",
				CI: "true",
				SKIP_TYPE_CHECK: "true",
				SKIP_DEPENDENCY_CHECK: "true",
				FORCE: "true",
				BROWSERSLIST_IGNORE_OLD_DATA: "true",
				DISABLE_NEW_JSX_TRANSFORM: "false",
			},
		},
	];

	for (const phase of phases) {
		try {
			execSync(phase.cmd, {
				cwd: buildPath,
				stdio: "inherit",
				env: phase.options,
			});
		} catch (error) {
			console.error(`Build failed: ${phase.cmd}`, error);
			throw error;
		}
	}
}
