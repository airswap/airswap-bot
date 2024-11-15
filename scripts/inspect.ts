import { inspect } from "../src/commands/inspect";
import { Config } from "../src/utils";

const config = new Config();

async function main() {
	console.log(
		await inspect(
			[
				"mainnet",
				"https://localhost:3000/",
				"0x0000000000000000000000000000000000000000",
				"0x0000000000000000000000000000000000000000",
			],
			config,
		),
	);
}
main();
