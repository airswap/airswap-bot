import { getReceiptUrl } from "@airswap/utils";
import { commify } from "@ethersproject/units";
import { TwitterApi } from "twitter-api-v2";
import type Config from "../config";
import type { SwapEventParams } from "../utils";
let client: TwitterApi;

export default class Twitter {
	config: Config;
	constructor(config: Config) {
		this.config = config;
	}
	async name() {
		const username = (await client.v2.me()).data.username;
		return `Twitter (${username})`;
	}
	async init() {
		client = new TwitterApi({
			appKey: this.config.get("TWITTER_APP_KEY"),
			appSecret: this.config.get("TWITTER_APP_SECRET"),
			accessToken: this.config.get("TWITTER_ACCESS_TOKEN"),
			accessSecret: this.config.get("TWITTER_ACCESS_SECRET"),
		});
	}
	async close() {
		return;
	}
	async publishEvent(params: { [key: string]: any }) {
		return;
	}
	async publishSwap(details: SwapEventParams) {
		client.v2.tweet(
			`Big Swap 💥 $${commify(details.swapValue.toFixed(2))} (${
				details.senderTokens
			}→${details.signerTokens}) ${getReceiptUrl(
				details.chainId,
				details.hash,
			)}`,
		);
	}
}
