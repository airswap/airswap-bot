import type Config from "../config";
import { compliance } from "./compliance";
import { inspect } from "./inspect";
import { launch } from "./launch";
import { stats } from "./stats";

const handlers = {
	inspect,
	compliance,
	stats,
	launch,
};

export const handleCommand = async (
	instruction: string,
	message: any,
	config: Config,
) => {
	config.logger.info(`[Command(Discord)]: ${instruction}`);

	const split = instruction.split(" ");
	const command = split[0];
	const args = split.slice(1);

	switch (command.trim()) {
		case "status":
			message.reply({
				content: `\`${JSON.stringify({
					PUBLISHING: config.get("PUBLISHING"),
					BIG_SWAP_MIN_VALUE: config.get("BIG_SWAP_MIN_VALUE"),
				})}\``,
			});
			break;
		case "mute":
			config.set("PUBLISHING", false);
			config.logger.info("[Config] Publishing", config.get("PUBLISHING"));
			message.react("✅");
			break;
		case "unmute":
			config.set("PUBLISHING", true);
			config.logger.info("[Config] Publishing", config.get("PUBLISHING"));
			message.react("✅");
			break;
		default:
			if (command.trim() in handlers) {
				try {
					message.react("👌");
					const result = await handlers[command.trim()](args, config);
					message.reply({ content: result, fetchReply: true });
					config.logger.info(`[Response] ${result}`);
				} catch (e: any) {
					message.reply({
						content: `Had a problem with command: ${JSON.stringify(e.message)}`,
						fetchReply: true,
					});
				}
			} else {
				if (!Number.isNaN(Number.parseInt(command))) {
					config.set("BIG_SWAP_MIN_VALUE", Number.parseInt(command));
					config.logger.info(
						"[Config] Minimum value",
						config.get("BIG_SWAP_MIN_VALUE"),
					);
					message.react("✅");
				} else {
					message.react("🤨");
				}
			}
	}
};
