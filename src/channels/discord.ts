import { chainNames, getAccountUrl, getReceiptUrl } from "@airswap/utils";
import { commify } from "@ethersproject/units";
import {
	ChannelType,
	Client,
	EmbedBuilder,
	Events,
	GatewayIntentBits,
} from "discord.js";
import { handleCommand } from "../commands";
import {
	type Config,
	type SwapEventParams,
	friendlyNames,
	minifyAddress,
} from "../utils";

export default class Discord {
	name = "Discord";
	client: Client;
	swapsChannelId: string;
	registryChannelId: string;
	config: Config;

	constructor(config: Config) {
		this.config = config;
		this.swapsChannelId = config.get("DISCORD_SWAPS_CHANNEL");
		this.registryChannelId = config.get("DISCORD_EVENTS_CHANNEL");
	}
	async init() {
		return new Promise((resolve) => {
			this.client = new Client({
				intents: [
					GatewayIntentBits.Guilds,
					GatewayIntentBits.GuildMessages,
					GatewayIntentBits.GuildMessageReactions,
				],
			});
			this.client.login(this.config.get("DISCORD_TOKEN")).then(() => {
				this.client.on(Events.ClientReady, resolve);
				this.client.on(Events.MessageCreate, async (message) => {
					if (message.content.startsWith("<@1072118621809156116>")) {
						handleCommand(message.content.slice(23), message, this.config);
					}
				});
			});
		});
	}
	async close() {
		await this.client.destroy();
	}
	async publishEvent(params: { [key: string]: any }) {
		const channel = await this.client.channels.fetch(this.registryChannelId);
		const title = `${params.name} Event`;
		const fields = Object.entries(params).map(([key, value]) => ({
			name: key,
			value: value,
			inline: true,
		}));
		const embed = new EmbedBuilder()
			.setDescription(title)
			.setColor(2847231)
			.addFields(fields);
		if (channel?.type === ChannelType.GuildText) {
			channel?.send({ embeds: [embed] });
		}
	}
	async publishSwap(details: SwapEventParams) {
		const channel = await this.client.channels.fetch(this.swapsChannelId);
		const title = "💥 Big Swap";
		const embed = new EmbedBuilder()
			.setDescription(title)
			.setColor(2847231)
			.addFields([
				{
					name: "Sender Tokens",
					value: details.senderTokens,
					inline: true,
				},
				{
					name: "Signer Tokens",
					value: details.signerTokens,
					inline: true,
				},
				{
					name: "Value",
					value: `$${commify(details.swapValue.toFixed(2))}`,
					inline: true,
				},
				{
					name: "Protocol Fee",
					value: `$${commify(details.feeValue.toFixed(2))}`,
					inline: true,
				},
				{
					name: "Signer Address",
					value: `[${minifyAddress(details.signerWallet)}](${getAccountUrl(
						details.chainId,
						details.signerWallet,
					)})`,
					inline: true,
				},
				{
					name: "Chain",
					value: `[${
						friendlyNames[chainNames[details.chainId]]
					}](${getReceiptUrl(details.chainId, details.hash)})`,
					inline: true,
				},
			]);
		if (channel?.type === ChannelType.GuildText) {
			channel?.send({ embeds: [embed] });
		}
	}
}
