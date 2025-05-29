import { NextResponse } from "next/server"
import crypto from "crypto"

// Helper functions for API signatures
function createOKXSignature(timestamp: string, method: string, requestPath: string, body: string, secretKey: string) {
  const message = timestamp + method + requestPath + body
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64")
}

function createKuCoinSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  secretKey: string,
) {
  const message = timestamp + method + requestPath + body
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64")
}

function createKuCoinPassphraseSignature(passphrase: string, secretKey: string) {
  return crypto.createHmac("sha256", secretKey).update(passphrase).digest("base64")
}

// Minimum profit percentage to consider an opportunity valid
const MIN_PROFIT_PERCENT = 0.5
// Maximum profit percentage before considering suspicious
const MAX_PROFIT_PERCENT = 50
// Minimum price difference to consider an opportunity valid (in USDT)
const MIN_PRICE_DIFF = 0.0001

export async function GET() {
  try {
    console.log("Fetching prices from exchanges...")
    // OKX API
    let okxData = null
    try {
      console.log("Fetching OKX prices...")
      const okxController = new AbortController()
      const okxTimeoutId = setTimeout(() => okxController.abort(), 10000)
      let okxResponse = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Cache-Control": "no-cache",
        },
        signal: okxController.signal,
        cache: "no-store",
      })
      clearTimeout(okxTimeoutId)
      if (!okxResponse.ok) {
        console.error(`OKX primary API error: ${okxResponse.status} ${okxResponse.statusText}`)
        // Try alternative endpoint if primary fails
        console.log("Trying OKX alternative endpoint...")
        const altController = new AbortController()
        const altTimeoutId = setTimeout(() => altController.abort(), 10000)
        okxResponse = await fetch("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT", {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Cache-Control": "no-cache",
          },
          signal: altController.signal,
          cache: "no-store",
        })
        clearTimeout(altTimeoutId)
      }
      if (okxResponse.ok) {
        okxData = await okxResponse.json()
        console.log(`OKX response received with ${okxData?.data?.length || 0} items`)
      } else {
        console.error(`OKX alternative API also failed: ${okxResponse.status} ${okxResponse.statusText}`)
      }
    } catch (okxError) {
      console.error("OKX fetch failed:", okxError.message)
      // Try one more time with a different approach
      try {
        console.log("Attempting OKX fetch with basic configuration...")
        const basicResponse = await fetch("https://www.okx.com/api/v5/market/ticker-lite")
        if (basicResponse.ok) {
          okxData = await basicResponse.json()
          console.log("OKX basic fetch succeeded")
        }
      } catch (basicError) {
        console.error("OKX basic fetch also failed:", basicError.message)
      }
    }
    // KuCoin API
    let kucoinData = null
    try {
      console.log("Fetching KuCoin prices...")
      const kucoinController = new AbortController()
      const kucoinTimeoutId = setTimeout(() => kucoinController.abort(), 10000)
      let kucoinResponse = await fetch("https://api.kucoin.com/api/v1/market/allTickers", {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Cache-Control": "no-cache",
        },
        signal: kucoinController.signal,
        cache: "no-store",
      })
      clearTimeout(kucoinTimeoutId)
      if (!kucoinResponse.ok) {
        console.error(`KuCoin primary API error: ${kucoinResponse.status} ${kucoinResponse.statusText}`)
        // Try alternative endpoint if primary fails
        console.log("Trying KuCoin alternative endpoint...")
        const altController = new AbortController()
        const altTimeoutId = setTimeout(() => altController.abort(), 10000)
        kucoinResponse = await fetch("https://api.kucoin.com/api/v1/market/stats", {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Cache-Control": "no-cache",
          },
          signal: altController.signal,
          cache: "no-store",
        })
        clearTimeout(altTimeoutId)
      }
      if (kucoinResponse.ok) {
        kucoinData = await kucoinResponse.json()
        console.log(
          `KuCoin response received with ${kucoinData?.data?.ticker?.length || kucoinData?.data?.length || 0} items`,
        )
      } else {
        console.error(`KuCoin alternative API also failed: ${kucoinResponse.status} ${kucoinResponse.statusText}`)
      }
    } catch (kucoinError) {
      console.error("KuCoin fetch failed:", kucoinError.message)
      // Try one more time with a different approach
      try {
        console.log("Attempting KuCoin fetch with basic configuration...")
        const basicResponse = await fetch("https://api.kucoin.com/api/v1/market/allTickers")
        if (basicResponse.ok) {
          kucoinData = await basicResponse.json()
          console.log("KuCoin basic fetch succeeded")
        }
      } catch (basicError) {
        console.error("KuCoin basic fetch also failed:", basicError.message)
      }
    }
    // If both APIs failed, return an error
    if (!okxData && !kucoinData) {
      throw new Error("Both exchange APIs are unavailable")
    }
    // Process OKX data
    const okxPrices = new Map<string, number>()
    if (okxData?.data && Array.isArray(okxData.data)) {
      let okxProcessed = 0
      okxData.data.forEach((ticker: any) => {
        if (ticker.instId && ticker.instId.endsWith("-USDT") && ticker.last) {
          const symbol = ticker.instId.replace("-USDT", "")
          const price = Number.parseFloat(ticker.last)
          if (!isNaN(price) && price > 0 && price < 5) {
            okxPrices.set(symbol, price)
            okxProcessed++
          }
        }
      })
      console.log(`Processed ${okxProcessed} OKX coins under $5`)
    }
    // Process KuCoin data with flexible structure handling
    const kucoinPrices = new Map<string, number>()
    if (kucoinData?.data) {
      let kucoinProcessed = 0
      // Handle different response structures
      const tickerArray = kucoinData.data.ticker || kucoinData.data
      if (Array.isArray(tickerArray)) {
        tickerArray.forEach((ticker: any) => {
          if (ticker.symbol && ticker.symbol.endsWith("-USDT")) {
            const symbol = ticker.symbol.replace("-USDT", "")
            const price = Number.parseFloat(ticker.price || ticker.last || ticker.close || "0")
            if (!isNaN(price) && price > 0 && price < 5) {
              kucoinPrices.set(symbol, price)
              kucoinProcessed++
            }
          }
        })
      }
      console.log(`Processed ${kucoinProcessed} KuCoin coins under $5`)
    }
    // Find common coins and calculate arbitrage opportunities
    const coins = []
    const commonSymbols = new Set([...okxPrices.keys()].filter((x) => kucoinPrices.has(x)))
    
    // Constants for fee calculation
    const OKX_FEE = 0.001 // 0.1%
    const KUCOIN_FEE = 0.001 // 0.1%
    
    for (const symbol of commonSymbols) {
      const okxPrice = okxPrices.get(symbol)!
      const kucoinPrice = kucoinPrices.get(symbol)!
      const priceDiff = Math.abs(okxPrice - kucoinPrice)
      const avgPrice = (okxPrice + kucoinPrice) / 2
      const profitPercent = (priceDiff / avgPrice) * 100
      
      // Calculate estimated trading amount based on price
      const getTradeAmount = (price: number) => {
        if (price < 0.01) return 100
        if (price < 0.1) return 50
        if (price < 1) return 10
        return 1
      }
      
      const amount = getTradeAmount(Math.min(okxPrice, kucoinPrice))
      const buyExchange = okxPrice < kucoinPrice ? "OKX" : "KuCoin"
      const sellExchange = okxPrice < kucoinPrice ? "KuCoin" : "OKX"
      const buyPrice = Math.min(okxPrice, kucoinPrice)
      const sellPrice = Math.max(okxPrice, kucoinPrice)
      const buyFee = buyPrice * amount * (buyExchange === "OKX" ? OKX_FEE : KUCOIN_FEE)
      const sellFee = sellPrice * amount * (sellExchange === "OKX" ? OKX_FEE : KUCOIN_FEE)
      const netProfit = (sellPrice - buyPrice) * amount - buyFee - sellFee
      
      // Only include opportunities that meet our criteria
      const isEligible = 
        profitPercent >= MIN_PROFIT_PERCENT && 
        profitPercent <= MAX_PROFIT_PERCENT && 
        priceDiff >= MIN_PRICE_DIFF &&
        netProfit > 0.01;
      
      if (isEligible) {
        coins.push({
          symbol,
          okxPrice,
          kucoinPrice,
          priceDiff,
          profitPercent,
          netProfit,
          buyExchange,
          sellExchange,
          estimatedAmount: amount,
          lastUpdated: new Date().toISOString(),
        })
      }
    }
    console.log(`Found ${coins.length} eligible arbitrage opportunities`)
    // Sort by profit percentage (highest first)
    coins.sort((a, b) => b.profitPercent - a.profitPercent)
    return NextResponse.json({
      coins: coins.slice(0, 50),
      timestamp: new Date().toISOString(),
      okxAvailable: !!okxData,
      kucoinAvailable: !!kucoinData,
      okxCoinsCount: okxPrices.size,
      kucoinCoinsCount: kucoinPrices.size,
      eligibilityFilters: {
        minProfitPercent: MIN_PROFIT_PERCENT,
        maxProfitPercent: MAX_PROFIT_PERCENT,
        minPriceDiff: MIN_PRICE_DIFF,
        minNetProfit: 0.01
      }
    })
  } catch (error) {
    console.error("Critical error in price fetch:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch prices from exchanges",
        message: error.message,
        timestamp: new Date().toISOString(),
        coins: [],
      },
      { status: 500 },
    )
  }
}
