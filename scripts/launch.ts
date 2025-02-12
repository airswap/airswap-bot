import { launch } from "../src/commands/launch";
import { Config } from "../src/utils";

const config = new Config();

async function main() {
	console.log(
		await launch(
			["sepolia", "0x93d2d57f295afde8b049c1210fb0aad072790b73", "eth"],
			config,
		),
	);
}
main();
