import {
	ChainIds,
	SECONDS_IN_DAY,
	findTokenByAddress,
	getKnownTokens,
	getTokenInfo,
	stakingTokenAddresses,
} from "@airswap/utils";
import axios from "axios";
import * as dotenv from "dotenv";
import { BigNumber, FixedNumber, ethers } from "ethers";
import { type Config, formatNumber, getHTTPProviderURL } from "../utils";

import erc20Abi from "erc-20-abi";
const erc20Interface = new ethers.utils.Interface(erc20Abi);

dotenv.config();

const JANUARY_FIRST = "2025-01-01T00:00:00";
const AST_TOTAL_SUPPLY = 5000000000000;
const TREASURY_ADDRESS = "0x24B4ce3Ad4366b73F839C1B1Fd11D1F636514534";
const SAST_V3_ADDRESS = "0x6d88B09805b90dad911E5C5A512eEDd984D6860B";
const SAST_V4_ADDRESS = "0x9fc450F9AfE2833Eb44f9A1369Ab3678D3929860";
const BIGGEST_SWAP_MIN = 200000;

export const stats = async (args: string[], config: Config) => {
	let interval = 30;
	switch (args[0]) {
		case "weekly":
			interval = 7;
			break;
		case "monthly":
			interval = 30;
			break;
		default:
			if (Number.parseInt(args[0])) {
				interval = Number.parseInt(args[0]);
			} else {
				interval = 7;
			}
	}
	let dailies = [];
	let lastId = Math.floor(Date.parse(JANUARY_FIRST) / 1000 / 86400);
	let result: axios.AxiosResponse;
	const todayId = Math.floor(Date.now() / 1000 / 86400);

	const subgraphURL = `https://gateway.thegraph.com/api/${config.get("SUBGRAPH_KEY")}/subgraphs/id/${config.get("SUBGRAPH_ID")}`;

	while (lastId < todayId) {
		result = await axios.post(subgraphURL, {
			query: `{
        dailies(where: { id_gt: ${lastId}} orderBy:id orderDirection:asc) {
          id
          volume
          fees
        }
      }`,
		});

		if (!result.data || !result.data.data) {
			throw new Error(JSON.stringify(result.data.errors));
		}
		if (!result.data.data.dailies.length) break;
		dailies = dailies.concat(result.data.data.dailies);
		lastId = result.data.data.dailies[result.data.data.dailies.length - 1].id;
	}

	dailies = dailies.reverse();

	const yearToDate =
		dailies.reduce((total: any, value: any) => {
			return total + Number(value.volume);
		}, 0);

	const intervalVol = dailies
		.slice(0, interval)
		.reduce((total: any, value: any) => {
			return total + Number(value.volume);
		}, 0);
	const intervalFees = dailies
		.slice(0, interval)
		.reduce((total: any, value: any) => {
			return total + Number(value.fees);
		}, 0);
	const lastIntervalVol = dailies
		.slice(interval, interval * 2)
		.reduce((total: any, value: any) => {
			return total + Number(value.volume);
		}, 0);

	const intervalChange = (intervalVol / lastIntervalVol - 1) * 100;

	let intervalChangeLabel = `${intervalChange.toFixed(2)}%`;
	intervalChangeLabel = (intervalChange > 1 ? "+" : "") + intervalChangeLabel;

	const { tokens } = await getKnownTokens(ChainIds.MAINNET);
	const provider = new ethers.providers.JsonRpcProvider(
		getHTTPProviderURL(ChainIds.MAINNET, config.get("INFURA_PROJECT_ID")),
	);

	result = await axios.post(subgraphURL, {
		query: `{
        swapERC20S(
          where: {senderAmountUSD_gt:${Number(BIGGEST_SWAP_MIN)} blockTimestamp_gt:${interval * SECONDS_IN_DAY}}
        ) {
          nonce
          senderAmountUSD
          signerToken {
            id
          }
          senderToken {
            id
          }
        }
      }`,
	});
	let biggest = {
		senderAmountUSD: 0,
		senderToken: "",
		signerToken: "",
	};
	result.data.data.swapERC20S.map((value: any) => {
		if (Number(value.senderAmountUSD) > Number(biggest.senderAmountUSD)) {
			biggest = value;
		}
	});

	let senderTokenInfo = findTokenByAddress(biggest.senderToken, tokens);
	if (!senderTokenInfo) {
		senderTokenInfo = await getTokenInfo(provider, biggest.senderToken);
	}
	let signerTokenInfo = findTokenByAddress(biggest.signerToken, tokens);
	if (!signerTokenInfo) {
		signerTokenInfo = await getTokenInfo(provider, biggest.signerToken);
	}

	const stakingToken = new ethers.Contract(
		stakingTokenAddresses[ChainIds.MAINNET],
		erc20Interface,
		provider,
	);
	const supply = BigNumber.from(AST_TOTAL_SUPPLY);
	const treasury = await stakingToken.balanceOf(TREASURY_ADDRESS);
	const treasuryBalance = BigNumber.from(treasury);
	const circulating = supply.sub(treasuryBalance);
	const sASTv3 = await stakingToken.balanceOf(SAST_V3_ADDRESS);
	const sASTv4 = await stakingToken.balanceOf(SAST_V4_ADDRESS);
	const totalStaked = BigNumber.from(sASTv3).add(sASTv4);
	const percentStaked = FixedNumber.from(totalStaked)
		.divUnsafe(FixedNumber.from(circulating))
		.mulUnsafe(FixedNumber.from("100"))
		.toString()
		.slice(0, 5);
	const totalStakedString = totalStaked.div(10000).toNumber();

	return `Mainnet Report (${interval}-day)

🔹 **$${formatNumber(
		intervalVol,
	)}** ${interval}-day vol (${intervalChangeLabel}) / $${formatNumber(intervalFees)} fees
💥 **$${formatNumber(biggest.senderAmountUSD)}** ${interval}-day biggest swap (${
		signerTokenInfo.symbol
	}/${senderTokenInfo.symbol})
🔒 **${formatNumber(
		totalStakedString,
	)} AST** (${percentStaked}%) staked by members
🚀 **$${formatNumber(yearToDate)}** year-to-date vol

#BUIDL with AirSwap today!
    `;
};
