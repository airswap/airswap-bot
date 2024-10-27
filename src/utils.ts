import IUniswapV3PoolABI from "@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json";
import Quoter from "@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json";
import { computePoolAddress } from "@uniswap/v3-sdk";

import { Token } from "@uniswap/sdk-core";
import { FeeAmount } from "@uniswap/v3-sdk";

import {
	type TokenInfo,
	apiUrls,
	chainLabels,
	toDecimalString,
} from "@airswap/utils";
import { ethers } from "ethers";

const POOL_FACTORY_CONTRACT_ADDRESS =
	"0x1F98431c8aD98523631AE4a59f267346ea31F984";
const QUOTER_CONTRACT_ADDRESS = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";

const EXPECTED_PONG_BACK = 15000;
const KEEP_ALIVE_CHECK_INTERVAL = 7500;

const STABLES = {
	USDT: 1,
	USDC: 1,
	BUSD: 1,
	DAI: 1,
};

export const defaultTokenInfo = {
	chainId: 0,
	name: "?",
	symbol: "?",
	decimals: 0,
	address: "?",
};

export const friendlyNames: any = {
	Ethereum: "Ethereum",
	BSC: "BNB Chain",
	Polygon: "Polygon",
	Avalanche: "Avalanche",
};

export type EventParams = {
	name: string;
	chainId: number;
	contract: string;
	hash: string;
	details?: Record<string, any>;
};

export type SwapEventParams = EventParams & {
	timestamp: string;
	senderTokens: string;
	signerTokens: string;
	signerWallet: string;
	swapValue: number;
	feeValue: number;
};

export type ReportDetails = {
	timeframe: string;
	volume: string;
};

export function getHTTPProviderURL(
	chainId: number,
	INFURA_PROVIDER_ID: string,
): string {
	let apiUrl = apiUrls[chainId];
	if (apiUrl.indexOf("infura.io") !== -1) {
		apiUrl += `/${INFURA_PROVIDER_ID}`;
	}
	return apiUrl;
}

export function getWebSocketProviderURL(
	chainId: number,
	INFURA_PROVIDER_ID: string,
): string {
	return;
}

export function minifyAddress(address: string) {
	const match = address.match(
		/^(0x[a-zA-Z0-9]{4})[a-zA-Z0-9]+([a-zA-Z0-9]{4})$/,
	);
	if (!match) return address;
	return `${match[1]}…${match[2]}`;
}

export function createSocketProvider(
	chainId: number,
	INFURA_PROVIDER_ID: string,
) {
	const provider: ethers.providers.WebSocketProvider =
		new ethers.providers.WebSocketProvider(
			`wss://${chainLabels[
				chainId
			].toLowerCase()}.infura.io/ws/v3/${INFURA_PROVIDER_ID}`,
		);
	let pingTimeout: NodeJS.Timeout;
	let keepAliveInterval: ReturnType<typeof setInterval> | undefined;

	provider._websocket.on("open", () => {
		keepAliveInterval = setInterval(() => {
			provider._websocket.ping();
			pingTimeout = setTimeout(() => {
				provider._websocket.terminate();
			}, EXPECTED_PONG_BACK);
		}, KEEP_ALIVE_CHECK_INTERVAL);
	});

	provider._websocket.on("close", () => {
		clearInterval(keepAliveInterval);
		clearTimeout(pingTimeout);
		throw new Error("WebSocket closed");
	});

	provider._websocket.on("pong", () => {
		clearInterval(pingTimeout);
	});
	return provider;
}

export async function getQuote(
	provider: ethers.providers.Provider,
	token: TokenInfo,
	tokenAmount: string,
	toToken: TokenInfo,
): Promise<string> {
	const chainId = (await provider.getNetwork()).chainId;
	const TOKEN_IN = new Token(
		Number(chainId),
		token.address,
		token.decimals,
		token.symbol,
		token.name,
	);

	const TOKEN_OUT = new Token(
		Number(chainId),
		toToken.address,
		toToken.decimals,
		toToken.symbol,
		toToken.name,
	);

	const quoterContract = new ethers.Contract(
		QUOTER_CONTRACT_ADDRESS,
		Quoter.abi,
		provider,
	);
	const poolConstants = await getPoolConstants(provider, TOKEN_IN, TOKEN_OUT);

	const quotedAmountOut = await quoterContract.callStatic.quoteExactInputSingle(
		poolConstants.token0,
		poolConstants.token1,
		poolConstants.fee,
		tokenAmount,
		0,
	);

	return quotedAmountOut;
}

async function getPoolConstants(
	provider: ethers.providers.Provider,
	tokenIn: Token,
	tokenOut: Token,
): Promise<{
	token0: string;
	token1: string;
	fee: number;
}> {
	const currentPoolAddress = computePoolAddress({
		factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
		tokenA: tokenIn,
		tokenB: tokenOut,
		fee: FeeAmount.MEDIUM,
	});

	const poolContract = new ethers.Contract(
		currentPoolAddress,
		IUniswapV3PoolABI.abi,
		provider,
	);
	const [token0, token1, fee] = await Promise.all([
		poolContract.token0(),
		poolContract.token1(),
		poolContract.fee(),
	]);

	return {
		token0,
		token1,
		fee,
	};
}

export async function getValue(
	provider: ethers.providers.Provider,
	signerTokenInfo: TokenInfo,
	signerAmount: string,
	senderTokenInfo: TokenInfo,
	senderAmount: string,
	toToken: TokenInfo,
): Promise<number> {
	if (signerTokenInfo.symbol in STABLES) {
		return Number(
			toDecimalString(signerAmount.toString(), signerTokenInfo.decimals),
		);
	}
	if (senderTokenInfo.symbol in STABLES) {
		return Number(
			toDecimalString(senderAmount.toString(), senderTokenInfo.decimals),
		);
	}
	try {
		return Number(
			toDecimalString(
				await getQuote(
					provider,
					signerTokenInfo,
					signerAmount.toString(),
					toToken,
				),
				toToken.decimals,
			),
		);
	} catch (e) {
		try {
			return Number(
				toDecimalString(
					await getQuote(
						provider,
						senderTokenInfo,
						senderAmount.toString(),
						toToken,
					),
					toToken.decimals,
				),
			);
		} catch (e1) {}
		return 0;
	}
}
