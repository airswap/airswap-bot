import { stats } from '../src/commands/stats'
import { Config } from '../src/utils'

const config = new Config()

async function main() {
  console.log(await stats([], config))
}
main()
