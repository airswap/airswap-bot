import { makers } from "../src/commands/makers";
import Config from "../src/config";

const config = new Config();

async function main() {
	console.log(await makers([], config));
}
main();
