import {
	ChainIds,
	findTokenByAddress,
	getKnownTokens,
	getTokenInfo,
	stakingTokenAddresses,
} from "@airswap/utils";
import axios from "axios";
import * as dotenv from "dotenv";
import { BigNumber, FixedNumber, ethers } from "ethers";
import { getHTTPProviderURL } from "../utils";

import erc20Abi from "erc-20-abi";
const erc20Interface = new ethers.utils.Interface(erc20Abi);

dotenv.config();

const subgraphURL = `https://gateway.thegraph.com/api/${process.env.SUBGRAPH_KEY}/subgraphs/id/${process.env.SUBGRAPH_ID}`;

const V4_YTD = 411640000;
const AST_TOTAL_SUPPLY = 5000000000000;
const TREASURY_ADDRESS = "0x24B4ce3Ad4366b73F839C1B1Fd11D1F636514534";
const SAST_V3_ADDRESS = "0x6d88B09805b90dad911E5C5A512eEDd984D6860B";
const SAST_V4_ADDRESS = "0x9fc450F9AfE2833Eb44f9A1369Ab3678D3929860";
const BIGGEST_SWAP_MIN = 200000;

export const stats = async () => {
	let dailies = [];
	let lastId = Math.floor(Date.parse("2024-01-01T00:00:00") / 1000 / 86400);
	let result: axios.AxiosResponse;
	const todayId = Math.floor(Date.now() / 1000 / 86400);

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
		}, 0) + V4_YTD;

	const monthlyVol = dailies.slice(0, 30).reduce((total: any, value: any) => {
		return total + Number(value.volume);
	}, 0);
	const monthlyFees = dailies.slice(0, 30).reduce((total: any, value: any) => {
		return total + Number(value.fees);
	}, 0);
	const lastMonthlyVol = dailies
		.slice(30, 60)
		.reduce((total: any, value: any) => {
			return total + Number(value.volume);
		}, 0);
	const weeklyVol = dailies.slice(0, 7).reduce((total: any, value: any) => {
		return total + Number(value.volume);
	}, 0);
	const lastWeeklyVol = dailies
		.slice(7, 14)
		.reduce((total: any, value: any) => {
			return total + Number(value.volume);
		}, 0);
	const weeklyFees = dailies.slice(0, 7).reduce((total: any, value: any) => {
		return total + Number(value.fees);
	}, 0);

	const monthlyChange = (monthlyVol / lastMonthlyVol - 1) * 100;
	const weeklyChange = (weeklyVol / lastWeeklyVol - 1) * 100;

	let monthlyChangeLabel = `${monthlyChange.toFixed(2)}%`;
	monthlyChangeLabel = (monthlyChange > 1 ? "+" : "") + monthlyChangeLabel;

	let weeklyChangeLabel = `${weeklyChange.toFixed(2)}%`;
	weeklyChangeLabel = (weeklyChange > 1 ? "+" : "") + weeklyChangeLabel;

	const { tokens } = await getKnownTokens(ChainIds.MAINNET);
	const provider = new ethers.providers.JsonRpcProvider(
		getHTTPProviderURL(ChainIds.MAINNET, process.env.INFURA_PROJECT_ID),
	);
	const largestMonthly = await getLargestSwap(
		Math.round(Date.now() / 1000 - 2.592e6),
		tokens,
		provider,
	);
	const largestWeekly = await getLargestSwap(
		Math.round(Date.now() / 1000 - 604800),
		tokens,
		provider,
	);

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

	return `Mainnet Report (V5)

🔹 **$${formatNumber(
		monthlyVol,
	)}** 30-day vol (${monthlyChangeLabel}) / $${formatNumber(monthlyFees)} fees
🔥 **$${formatNumber(largestMonthly.senderAmountUSD)}** ${
		largestMonthly.signerTokenInfo.symbol
	}/${largestMonthly.senderTokenInfo.symbol} 30-day biggest swap
🔹 **$${formatNumber(weeklyVol)}** 7-day vol (${weeklyChangeLabel}) / $${formatNumber(
		weeklyFees,
	)} fees
🔥 **$${formatNumber(largestWeekly.senderAmountUSD)}** ${
		largestWeekly.signerTokenInfo.symbol
	}/${largestWeekly.senderTokenInfo.symbol} 7-day biggest swap
🔒 **${formatNumber(
		totalStakedString,
	)} AST** (${percentStaked}%) staked by members
🚀 **$${formatNumber(yearToDate)}** year-to-date

#BUIDL with AirSwap today!
    `;
};

function formatNumber(num: number, precision = 2) {
	const map = [
		{ suffix: "T", threshold: 1e12 },
		{ suffix: "B", threshold: 1e9 },
		{ suffix: "M", threshold: 1e6 },
		{ suffix: "K", threshold: 1e3 },
		{ suffix: "", threshold: 1 },
	];

	const found = map.find((x) => Math.abs(num) >= x.threshold);
	if (found) {
		const formatted = (num / found.threshold).toFixed(precision) + found.suffix;

		return formatted;
	}

	return num;
}

async function getLargestSwap(
	since: number,
	tokens: any,
	provider: ethers.providers.JsonRpcProvider,
) {
	const result = await axios.post(subgraphURL, {
		query: `{
        swapERC20S(
          where: {senderAmountUSD_gt:${Number(BIGGEST_SWAP_MIN)} blockTimestamp_gt:${since}}
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
	let largest = {
		senderAmountUSD: 0,
		senderToken: "",
		signerToken: "",
	};
	result.data.data.swapERC20S.map((value: any) => {
		if (Number(value.senderAmountUSD) > Number(largest.senderAmountUSD)) {
			largest = value;
		}
	});

	let senderTokenInfo = findTokenByAddress(largest.senderToken, tokens);
	if (!senderTokenInfo) {
		senderTokenInfo = await getTokenInfo(provider, largest.senderToken);
	}
	let signerTokenInfo = findTokenByAddress(largest.signerToken, tokens);
	if (!signerTokenInfo) {
		signerTokenInfo = await getTokenInfo(provider, largest.signerToken);
	}

	return { ...largest, senderTokenInfo, signerTokenInfo };
}
