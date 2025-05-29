# Crypto Arbitrage Bot

A Next.js application that monitors cryptocurrency prices across exchanges (OKX and KuCoin) to identify arbitrage opportunities.

## Features

- Real-time price monitoring across OKX and KuCoin exchanges
- Automatic arbitrage opportunity detection
- Balance checking for connected exchange accounts
- Modern UI built with Next.js, React 19, and Tailwind CSS

## Deployment

This application is deployed on Render in the Frankfurt region (non-US) to ensure API compatibility with the exchanges.

### Environment Variables

The following environment variables are required for the application to function properly:

```
# OKX API Credentials
OKX_API_KEY=your_okx_api_key_here
OKX_SECRET_KEY=your_okx_secret_key_here
OKX_PASSPHRASE=your_okx_passphrase_here

# KuCoin API Credentials
KUCOIN_API_KEY=your_kucoin_api_key_here
KUCOIN_SECRET_KEY=your_kucoin_secret_key_here
KUCOIN_PASSPHRASE=your_kucoin_passphrase_here
```

### Local Development

1. Clone the repository
2. Create a `.env` file based on `.env.example`
3. Install dependencies: `pnpm install`
4. Run the development server: `pnpm dev`

### Production Deployment

1. Deploy to Render using the Web Service option
2. Set the region to Frankfurt (or any non-US region)
3. Configure the build command: `pnpm install && pnpm run build`
4. Configure the start command: `pnpm start`
5. Add all required environment variables in the Render dashboard

## Important Notes

- The APIs do not work from US-based servers, so ensure deployment is in a non-US region
- API keys with appropriate permissions are required for balance checking and trading
- Never commit actual API keys to the repository
