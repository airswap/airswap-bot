import { makers } from "../src/commands/makers";
import { Config } from "../src/utils";

const config = new Config();

async function main() {
	console.log(await makers([], config));
}
main();
