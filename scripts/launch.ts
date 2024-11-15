import { launch } from "../src/commands/launch";
import { Config } from "../src/utils";

const config = new Config();

async function main() {
	console.log(
		await launch(
			["mainnet", "0x451Eed19DcD5325760E08be6ABEb795913d3263a", "eth"],
			config,
		),
	);
}
main();
