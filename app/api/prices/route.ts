import { NextResponse } from "next/server"

interface OKXTicker {
  instId: string
  last: string
}

interface KuCoinTicker {
  symbol: string
  price: string
  last?: string
}

export async function GET() {
  try {
    console.log("Starting price fetch from exchanges...")

    // Fetch from OKX with improved error handling
    let okxData = null
    try {
      console.log("Fetching from OKX...")
      const okxController = new AbortController()
      const okxTimeoutId = setTimeout(() => okxController.abort(), 10000) // 10 second timeout

      const okxResponse = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", {
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
        console.error(`OKX API error: ${okxResponse.status} ${okxResponse.statusText}`)
      } else {
        okxData = await okxResponse.json()
        console.log(`OKX response received with ${okxData?.data?.length || 0} tickers`)
      }
    } catch (okxError) {
      console.error("OKX fetch failed:", okxError.message)
    }

    // Fetch from KuCoin with improved error handling and alternative endpoints
    let kucoinData = null
    try {
      console.log("Fetching from KuCoin...")
      const kucoinController = new AbortController()
      const kucoinTimeoutId = setTimeout(() => kucoinController.abort(), 10000) // 10 second timeout

      // Try the primary endpoint first
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
      okxData.data.forEach((ticker: OKXTicker) => {
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

    for (const symbol of commonSymbols) {
      const okxPrice = okxPrices.get(symbol)!
      const kucoinPrice = kucoinPrices.get(symbol)!

      const priceDiff = Math.abs(okxPrice - kucoinPrice)
      const avgPrice = (okxPrice + kucoinPrice) / 2
      const profitPercent = (priceDiff / avgPrice) * 100

      coins.push({
        symbol,
        okxPrice,
        kucoinPrice,
        priceDiff,
        profitPercent,
        lastUpdated: new Date().toISOString(),
      })
    }

    console.log(`Found ${coins.length} common coins between exchanges`)

    // Sort by profit percentage (highest first)
    coins.sort((a, b) => b.profitPercent - a.profitPercent)

    return NextResponse.json({
      coins: coins.slice(0, 50),
      timestamp: new Date().toISOString(),
      okxAvailable: !!okxData,
      kucoinAvailable: !!kucoinData,
      okxCoinsCount: okxPrices.size,
      kucoinCoinsCount: kucoinPrices.size,
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
