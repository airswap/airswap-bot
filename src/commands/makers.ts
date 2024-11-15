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
import { type Config, formatNumber, getHTTPProviderURL } from "../utils";

import erc20Abi from "erc-20-abi";
const erc20Interface = new ethers.utils.Interface(erc20Abi);

dotenv.config();

export const makers = async (args: string[], config: Config) => {
	const subgraphURL = `https://gateway.thegraph.com/api/${config.get("SUBGRAPH_KEY")}/subgraphs/id/${config.get("SUBGRAPH_ID")}`;

	const result = await axios.post(subgraphURL, {
		query: `{
        swapERC20S(
          where: {blockTimestamp_gt:${Math.round(Date.now() / 1000 - 2.592e6)}}
        ) {
          nonce
					signerWallet
          signerAmountUSD
          signerToken {
            id
          }
          senderToken {
            id
          }
        }
      }`,
	});

	const makers = {};
	result.data.data.swapERC20S.map((value: any) => {
		makers[value.signerWallet] = makers[value.signerWallet]
			? makers[value.signerWallet] + Number(value.signerAmountUSD)
			: Number(value.signerAmountUSD);
	});

	return `Makers Report (Last ${result.data.data.swapERC20S.length} Swaps)

\`\`\`${Object.entries(makers)
		.map(([maker, amount]) => `${maker}: $${formatNumber(Number(amount))}`)
		.join("\n")}\`\`\`

#BUIDL with AirSwap today!
    `;
};
