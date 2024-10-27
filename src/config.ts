import bunyan from "bunyan";
import * as dotenv from "dotenv";

dotenv.config();

export default class Config {
	env: any;
	logger: bunyan;
	constructor() {
		this.env = {
			PUBLISHING: false,
			BIG_SWAP_MIN_VALUE: 0,
			INFURA_PROVIDER_ID: "",
			DISCORD_TOKEN: "",
			DISCORD_SWAPS_CHANNEL: "",
			DISCORD_EVENTS_CHANNEL: "",
			TWITTER_USER_ID: "",
			TWITTER_APP_KEY: "",
			TWITTER_APP_SECRET: "",
			TWITTER_ACCESS_TOKEN: "",
			TWITTER_ACCESS_SECRET: "",
			SUBGRAPH_KEY: "",
			SUBGRAPH_ID: "",
			EXEMPTIONS: "",
			TEST_SENDER_WALLET: "",
			ALCHEMY_KEYS_1: "",
			ALCHEMY_KEYS_137: "",
			ALCHEMY_KEYS_11155111: "",
			REPO_URL: "",
			IPFS_URL: "",
			STORAGE_SERVER_URL: "",
			INFURA_PROJECT_ID: "",
			INFURA_PROJECT_SECRET: "",
		};
		for (const key in this.env) {
			this.env[key] = process.env[key];
		}
		this.logger = bunyan.createLogger({
			name: "airswapbot",
			streams: [
				{
					level: "trace",
					stream: process.stdout,
				},
				{
					level: "debug",
					path: "/var/tmp/airswapbot.json",
				},
			],
		});
	}

	get(key: string) {
		return this.env[key];
	}

	set(key: string, value: any) {
		this.env[key] = value;
	}
}
