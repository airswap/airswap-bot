# AirSwap Bot: Swappy

[![Discord](https://img.shields.io/discord/590643190281928738.svg)](https://chat.airswap.io) ![Twitter Follow](https://img.shields.io/twitter/follow/airswap?style=social) ![Subreddit subscribers](https://img.shields.io/reddit/subreddit-subscribers/AirSwap?style=social)

[Website](https://www.airswap.io/) · [About](https://about.airswap.io/) · [Twitter](https://twitter.com/airswap) · [Discord](https://chat.airswap.io/)

First, please give us a star! ⭐️

## Features

- Commands (Discord or CLI)

  - `stats` generates a mainnet stats report
  - `compliance :chainName` checks all servers for RFQ compliance
  - `inspect :chainName :server :signerToken :senderToken :senderAmount` checks an individual server for RFQ compliance
  - `launch :chainName :collectionToken :currencySymbol` launches an NFT marketplace on IPFS

- Event Listeners

  - `SwapERC20` publishes big swaps to Twitter and Discord
  - Contracts `Registry`, `Delegate`, `Pool`, `Staking` publish events to Discord

- Network Providers
  - Mainnet (1) uses a WebSocket INFURA provider
  - Other networks use default JSON RPC providers from `@airswap/utils`

## Quick start

Copy `.env.example` to `.env` and fill in the values.

_To install deps and run from source_

```
$ yarn
$ yarn dev
```

_To build and run production_

```
$ yarn build
$ yarn start
```

_To build a docker image_

```
$ yarn docker:build
```

AirSwap is an open developer community focused on decentralized trading systems. Join the [Discord](https://chat.airswap.io/) server to learn more.

Let's build stuff! 🛠️
