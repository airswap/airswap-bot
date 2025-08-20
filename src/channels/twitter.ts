import { getReceiptUrl } from '@airswap/utils'
import { commify } from '@ethersproject/units'
import { TwitterApi } from 'twitter-api-v2'
import type { Config, SwapEventParams } from '../utils'
let client: TwitterApi

export default class Twitter {
  public name = 'Twitter'
  public config: Config

  public constructor(config: Config) {
    this.config = config
  }
  public async init() {
    client = new TwitterApi({
      appKey: this.config.get('TWITTER_APP_KEY'),
      appSecret: this.config.get('TWITTER_APP_SECRET'),
      accessToken: this.config.get('TWITTER_ACCESS_TOKEN'),
      accessSecret: this.config.get('TWITTER_ACCESS_SECRET'),
    })
  }
  public async close() {
    return
  }
  public async publishEvent() {
    return
  }
  public async publishSwap(details: SwapEventParams) {
    client.v2.tweet(
      `Big Swap 💥 $${commify(details.swapValue.toFixed(2))} (${
        details.senderTokens
      }→${details.signerTokens}) ${getReceiptUrl(
        details.chainId,
        details.hash
      )}`
    )
  }
}
