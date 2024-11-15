import * as poolDeploys from "@airswap/pool/deploys.js";
import * as SwapContract from "@airswap/swap-erc20/build/contracts/SwapERC20.sol/SwapERC20.json";
import * as swapDeploys from "@airswap/swap-erc20/deploys.js";
import {
	chainNames,
	findTokenByAddress,
	findTokensBySymbol,
	getFullSwapERC20,
	getKnownTokens,
	getReceiptUrl,
	getTokenInfo,
	protocolFeeReceiverAddresses,
	toDecimalString,
} from "@airswap/utils";
import { commify } from "@ethersproject/units";
import { ethers } from "ethers";
import {
	type Config,
	type SwapEventParams,
	defaultTokenInfo,
	getValue,
} from "../utils";

export class SwapERC20 {
	provider: ethers.providers.Provider;
	publish: (type: string, params: any) => void;
	config: Config;
	contract: ethers.Contract;

	constructor(
		provider: ethers.providers.Provider,
		publish: (type: string, params: any) => void,
		config: Config,
	) {
		this.provider = provider;
		this.publish = publish;
		this.config = config;
	}

	private listener = async (
		nonce: string,
		signerWallet: string,
		event: ethers.Event,
	) => {
		const chainId = (await this.provider.getNetwork()).chainId;
		const { tokens } = await getKnownTokens(chainId);
		let protocolFeeReceiver = poolDeploys[chainId];
		if (protocolFeeReceiverAddresses[chainId]) {
			protocolFeeReceiver = protocolFeeReceiverAddresses[chainId];
		}

		const { signerToken, signerAmount, senderToken, senderAmount } =
			await getFullSwapERC20(
				nonce,
				signerWallet,
				protocolFeeReceiver,
				(await event.getTransactionReceipt()).logs,
			);

		const USDT = findTokensBySymbol("USDT", tokens)[0];
		let transaction = null;
		let swapValue = 0;

		let senderTokenInfo = findTokenByAddress(senderToken, tokens);
		if (!senderTokenInfo) {
			senderTokenInfo = await getTokenInfo(
				this.provider as ethers.providers.Provider,
				senderToken,
			);
		}
		let signerTokenInfo = findTokenByAddress(signerToken, tokens);
		if (!signerTokenInfo) {
			signerTokenInfo = await getTokenInfo(this.provider, signerToken);
		}
		const senderUnits = Number(
			toDecimalString(senderAmount.toString(), senderTokenInfo.decimals),
		);
		const signerUnits = Number(
			toDecimalString(signerAmount.toString(), signerTokenInfo.decimals),
		);

		if (!senderTokenInfo)
			senderTokenInfo = { ...defaultTokenInfo, address: senderToken };
		if (!signerTokenInfo)
			signerTokenInfo = { ...defaultTokenInfo, address: signerToken };

		try {
			transaction = await event.getTransaction();
		} catch (e: any) {
			this.config.logger.warn(
				"Could not get transaction from event",
				e.message,
			);
			return;
		}

		try {
			swapValue = await getValue(
				this.provider,
				signerTokenInfo,
				signerAmount,
				senderTokenInfo,
				senderAmount,
				USDT,
			);
		} catch (e: any) {
			this.config.logger.warn(
				"Could not get swap value",
				`[${chainId}] ${senderUnits} ${senderTokenInfo.symbol} → ` +
					`${signerUnits} ${signerTokenInfo.symbol}`,
			);
		}

		const details: SwapEventParams = {
			name: event.event,
			hash: `${transaction?.hash}`,
			chainId,
			contract: swapDeploys[chainId],
			timestamp: Date.now().toString(),
			signerWallet: signerWallet,
			senderTokens: `${commify(senderUnits.toFixed(4))} ${
				senderTokenInfo.symbol
			}`,
			signerTokens: `${commify(signerUnits.toFixed(4))} ${
				signerTokenInfo.symbol
			}`,
			swapValue,
			feeValue: swapValue * 0.0007,
		};

		this.config.logger.info(
			`[${chainId}] SwapERC20: $${details.swapValue} (${details.senderTokens} → ` +
				`${details.signerTokens}) ${getReceiptUrl(
					details.chainId,
					details.hash,
				)}`,
		);

		if (swapValue >= +this.config.get("BIG_SWAP_MIN_VALUE")) {
			this.publish("SwapERC20", details);
		}
	};

	async start() {
		const chainId = (await this.provider.getNetwork()).chainId;
		if (!(String(chainId) in swapDeploys)) {
			throw new Error("SwapERC20: No contract deployed");
		}
		try {
			this.contract = new ethers.Contract(
				swapDeploys[String(chainId)],
				SwapContract.abi,
				this.provider,
			);
			this.contract.on("SwapERC20", this.listener);
			this.config.logger.info(
				`${chainNames[chainId]} [${chainId}]: Listening SwapERC20 (${swapDeploys[chainId]}) for SwapERC20`,
			);
		} catch (e: any) {
			this.config.logger.error(
				"SwapERC20: problem creating SwapERC20 event subscription",
				e.message,
			);
		}
	}

	async stop() {
		try {
			if (this.contract) this.contract.off("SwapERC20", this.listener);
		} catch (e: any) {
			this.config.logger.error(
				"SwapERC20: problem removing SwapERC20 event subscription",
				e.message,
			);
		}
	}
}
