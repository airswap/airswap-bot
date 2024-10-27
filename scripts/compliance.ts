import { compliance } from "../src/commands/compliance";
import Config from "../src/config";

const config = new Config();

async function main() {
	console.log(await compliance(["mainnet"], config));
}
main();
