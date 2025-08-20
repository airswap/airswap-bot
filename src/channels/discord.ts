import {
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
} from 'discord.js'
import { commify } from '@ethersproject/units'
import { chainNames, getAccountUrl, getReceiptUrl } from '@airswap/utils'
import { handleCommand } from '../commands'
import {
  type Config,
  type SwapEventParams,
  friendlyNames,
  minifyAddress,
} from '../utils'

export default class Discord {
  public name = 'Discord'
  public client: Client
  public swapsChannelId: string
  public registryChannelId: string
  public config: Config

  public constructor(config: Config) {
    this.config = config
    this.swapsChannelId = config.get('DISCORD_SWAPS_CHANNEL')
    this.registryChannelId = config.get('DISCORD_EVENTS_CHANNEL')
  }
  public async init() {
    return new Promise((resolve) => {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.GuildMessageReactions,
        ],
      })
      this.client.login(this.config.get('DISCORD_TOKEN')).then(() => {
        this.client.on(Events.ClientReady, resolve)
        this.client.on(Events.MessageCreate, async (message) => {
          const botMention = `<@${this.config.get('DISCORD_BOT_USER_ID')}>`
          if (message.content.startsWith(botMention)) {
            handleCommand(
              message.content.slice(botMention.length).trim(),
              message,
              this.config
            )
          }
        })
      })
    })
  }
  public async close() {
    await this.client.destroy()
  }
  public async publishEvent(params: { [key: string]: any }) {
    const channel = await this.client.channels.fetch(this.registryChannelId)
    const title = `${params.name} Event`
    const fields = Object.entries(params).map(([key, value]) => ({
      name: key,
      value: value,
      inline: true,
    }))
    const embed = new EmbedBuilder()
      .setDescription(title)
      .setColor(this.config.get('DISCORD_EMBED_COLOR'))
      .addFields(fields)
    if (channel?.type === ChannelType.GuildText) {
      channel?.send({ embeds: [embed] })
    }
  }
  public async publishSwap(details: SwapEventParams) {
    const channel = await this.client.channels.fetch(this.swapsChannelId)
    const title = '💥 Big Swap'
    const embed = new EmbedBuilder()
      .setDescription(title)
      .setColor(this.config.get('DISCORD_EMBED_COLOR'))
      .addFields([
        {
          name: 'Sender Tokens',
          value: details.senderTokens,
          inline: true,
        },
        {
          name: 'Signer Tokens',
          value: details.signerTokens,
          inline: true,
        },
        {
          name: 'Value',
          value: `$${commify(details.swapValue.toFixed(2))}`,
          inline: true,
        },
        {
          name: 'Protocol Fee',
          value: `$${commify(details.feeValue.toFixed(2))}`,
          inline: true,
        },
        {
          name: 'Signer Address',
          value: `[${minifyAddress(details.signerWallet)}](${getAccountUrl(
            details.chainId,
            details.signerWallet
          )})`,
          inline: true,
        },
        {
          name: 'Chain',
          value: `[${
            friendlyNames[chainNames[details.chainId]]
          }](${getReceiptUrl(details.chainId, details.hash)})`,
          inline: true,
        },
      ])
    if (channel?.type === ChannelType.GuildText) {
      channel?.send({ embeds: [embed] })
    }
  }
}
