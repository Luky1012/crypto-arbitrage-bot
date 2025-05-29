"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TrendingUp, TrendingDown, DollarSign, Activity, AlertTriangle } from "lucide-react"
import { ErrorDisplay } from "./components/error-display"
import { ConnectionStatus } from "./components/connection-status"

interface CoinPrice {
  symbol: string
  okxPrice: number
  kucoinPrice: number
  priceDiff: number
  profitPercent: number
  lastUpdated: string
}

interface Balance {
  okx: number
  kucoin: number
}

interface Trade {
  id: string
  coinName: string
  buyExchange: string
  sellExchange: string
  buyPrice: number
  sellPrice: number
  amount: number
  buyFee: number
  sellFee: number
  netProfit: number
  executionTime: string
  buyExecuted: boolean
  sellExecuted: boolean
  status: "pending" | "completed" | "failed"
  errors?: {
    buy?: string
    sell?: string
  }
  details?: any
}

export default function ArbitrageTradingBot() {
  const [coins, setCoins] = useState<CoinPrice[]>([])
  const [balance, setBalance] = useState<Balance>({ okx: 0, kucoin: 0 })
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false)
  const [trades, setTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [balanceErrors, setBalanceErrors] = useState<{ okx?: string; kucoin?: string }>({})
  const [exchangeStatus, setExchangeStatus] = useState<{
    okxAvailable?: boolean
    kucoinAvailable?: boolean
    okxCoinsCount?: number
    kucoinCoinsCount?: number
  }>({})

  // Commission fees (0.1% for both exchanges)
  const OKX_FEE = 0.001
  const KUCOIN_FEE = 0.001

  const getTradeAmount = (price: number): number => {
    if (price > 3.5) return 1
    if (price >= 1 && price <= 3.5) return 4
    if (price >= 0.05 && price < 1) return 8
    if (price < 0.5) return 15
    return 1
  }

  // Update the fetchPrices function to handle errors better
  const fetchPrices = useCallback(async () => {
    try {
      const response = await fetch("/api/prices", {
        cache: "no-store",
        next: { revalidate: 0 },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`API Error ${response.status}: ${errorData.message || response.statusText}`)
      }

      const data = await response.json()

      if (!data.coins || !Array.isArray(data.coins)) {
        throw new Error("Invalid price data format received from API")
      }

      setCoins(data.coins)
      setExchangeStatus({
        okxAvailable: data.okxAvailable,
        kucoinAvailable: data.kucoinAvailable,
        okxCoinsCount: data.okxCoinsCount,
        kucoinCoinsCount: data.kucoinCoinsCount,
      })
      setError(null)
      console.log(`Successfully loaded ${data.coins.length} coin pairs`)
    } catch (err) {
      console.error("Price fetch error:", err)
      setError(`Price fetch failed: ${err.message}`)
      setCoins([])
    }
  }, [])

  const fetchBalances = useCallback(async () => {
    try {
      const response = await fetch("/api/balances")
      if (!response.ok) throw new Error("Failed to fetch balances")
      const data = await response.json()
      setBalance({ okx: data.okx, kucoin: data.kucoin })
      setBalanceErrors(data.errors || {})
      setError(null)
      console.log("Balance data:", data)
    } catch (err) {
      setError("Failed to fetch balances")
      console.error("Balance fetch error:", err)
    }
  }, [])

  const executeTrade = async (coin: CoinPrice) => {
    const amount = getTradeAmount(Math.min(coin.okxPrice, coin.kucoinPrice))
    const buyExchange = coin.okxPrice < coin.kucoinPrice ? "OKX" : "KuCoin"
    const sellExchange = coin.okxPrice < coin.kucoinPrice ? "KuCoin" : "OKX"
    const buyPrice = Math.min(coin.okxPrice, coin.kucoinPrice)
    const sellPrice = Math.max(coin.okxPrice, coin.kucoinPrice)

    const buyFee = buyPrice * amount * (buyExchange === "OKX" ? OKX_FEE : KUCOIN_FEE)
    const sellFee = sellPrice * amount * (sellExchange === "OKX" ? OKX_FEE : KUCOIN_FEE)
    const netProfit = (sellPrice - buyPrice) * amount - buyFee - sellFee

    if (netProfit <= 0.01) {
      setError("Profit too low after fees")
      return
    }

    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const newTrade: Trade = {
      id: tradeId,
      coinName: coin.symbol,
      buyExchange,
      sellExchange,
      buyPrice,
      sellPrice,
      amount,
      buyFee,
      sellFee,
      netProfit,
      executionTime: new Date().toISOString(),
      buyExecuted: false,
      sellExecuted: false,
      status: "pending",
    }

    setTrades((prev) => [newTrade, ...prev])

    try {
      const response = await fetch("/api/execute-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: coin.symbol,
          amount,
          buyExchange,
          sellExchange,
          tradeId,
        }),
      })

      const result = await response.json()
      console.log("Trade execution result:", result)

      setTrades((prev) =>
        prev.map((trade) =>
          trade.id === tradeId
            ? {
                ...trade,
                buyExecuted: result.buyExecuted,
                sellExecuted: result.sellExecuted,
                status: result.buyExecuted && result.sellExecuted ? "completed" : "failed",
                errors: result.errors,
                details: result.details,
              }
            : trade,
        ),
      )

      if (result.success) {
        await fetchBalances()
      }
    } catch (err) {
      setTrades((prev) =>
        prev.map((trade) =>
          trade.id === tradeId
            ? {
                ...trade,
                status: "failed",
                errors: { buy: "Network error", sell: "Network error" },
              }
            : trade,
        ),
      )
      setError("Trade execution failed")
    }
  }

  const autoTrade = useCallback(async () => {
    if (!autoTradeEnabled) return

    const profitableCoins = coins.filter((coin) => {
      const amount = getTradeAmount(Math.min(coin.okxPrice, coin.kucoinPrice))
      const buyPrice = Math.min(coin.okxPrice, coin.kucoinPrice)
      const sellPrice = Math.max(coin.okxPrice, coin.kucoinPrice)
      const buyFee = buyPrice * amount * OKX_FEE
      const sellFee = sellPrice * amount * KUCOIN_FEE
      const netProfit = (sellPrice - buyPrice) * amount - buyFee - sellFee
      return netProfit > 0.01 && coin.profitPercent <= 50
    })

    if (profitableCoins.length > 0) {
      const bestCoin = profitableCoins.reduce((best, current) =>
        current.profitPercent > best.profitPercent ? current : best,
      )
      await executeTrade(bestCoin)
    }
  }, [autoTradeEnabled, coins])

  // Update the useEffect to use a more reliable interval
  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true)
      try {
        await Promise.all([fetchPrices(), fetchBalances()])
      } catch (err) {
        console.error("Initialization error:", err)
        setError(`Failed to initialize data: ${err.message}`)
      } finally {
        setIsLoading(false)
      }
    }

    initializeData()

    // Set up real-time price updates every 10 seconds (increased from 5 to reduce API load)
    const priceInterval = setInterval(fetchPrices, 10000)
    // Update balances every 30 seconds
    const balanceInterval = setInterval(fetchBalances, 30000)

    return () => {
      clearInterval(priceInterval)
      clearInterval(balanceInterval)
    }
  }, [fetchPrices, fetchBalances])

  useEffect(() => {
    if (autoTradeEnabled) {
      const autoTradeInterval = setInterval(autoTrade, 10000) // Check every 10 seconds
      return () => clearInterval(autoTradeInterval)
    }
  }, [autoTrade, autoTradeEnabled])

  const totalProfit = trades
    .filter((trade) => trade.status === "completed")
    .reduce((sum, trade) => sum + trade.netProfit, 0)

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Activity className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading trading data...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Crypto Arbitrage Trading Bot</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Switch id="auto-trade" checked={autoTradeEnabled} onCheckedChange={setAutoTradeEnabled} />
            <Label htmlFor="auto-trade">Auto Trade</Label>
          </div>
          <Badge variant={autoTradeEnabled ? "default" : "secondary"}>{autoTradeEnabled ? "ON" : "OFF"}</Badge>
        </div>
      </div>

      {error && (
        <ErrorDisplay
          message={error}
          onRetry={() => {
            setError(null)
            fetchPrices()
            fetchBalances()
          }}
        />
      )}

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">OKX Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${balance.okx.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">USDT</p>
            {balanceErrors.okx && (
              <div className="flex items-center mt-2 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {balanceErrors.okx}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">KuCoin Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${balance.kucoin.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">USDT</p>
            {balanceErrors.kucoin && (
              <div className="flex items-center mt-2 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {balanceErrors.kucoin}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              ${totalProfit.toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground">Net profit from trades</p>
          </CardContent>
        </Card>

        <ConnectionStatus
          okxAvailable={exchangeStatus.okxAvailable}
          kucoinAvailable={exchangeStatus.kucoinAvailable}
          okxCoinsCount={exchangeStatus.okxCoinsCount}
          kucoinCoinsCount={exchangeStatus.kucoinCoinsCount}
          lastUpdate={coins.length > 0 ? coins[0].lastUpdated : undefined}
        />
      </div>

      {/* Price Monitoring */}
      <Card>
        <CardHeader>
          <CardTitle>Real-time Price Monitoring (Coins under $5)</CardTitle>
          <CardDescription>Monitoring price differences between OKX and KuCoin exchanges</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <div className="space-y-4">
              {coins.map((coin) => {
                const amount = getTradeAmount(Math.min(coin.okxPrice, coin.kucoinPrice))
                const buyPrice = Math.min(coin.okxPrice, coin.kucoinPrice)
                const sellPrice = Math.max(coin.okxPrice, coin.kucoinPrice)
                const buyFee = buyPrice * amount * OKX_FEE
                const sellFee = sellPrice * amount * KUCOIN_FEE
                const netProfit = (sellPrice - buyPrice) * amount - buyFee - sellFee
                const isProfitable = netProfit > 0.01 && coin.profitPercent <= 50
                const isSuspicious = coin.profitPercent > 50

                return (
                  <div key={coin.symbol} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold">{coin.symbol}</h3>
                        <Badge variant={isSuspicious ? "destructive" : isProfitable ? "default" : "secondary"}>
                          {isSuspicious ? "Suspicious" : isProfitable ? "Profitable" : "Not Profitable"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">OKX: ${coin.okxPrice.toFixed(6)}</p>
                          <p className="text-muted-foreground">KuCoin: ${coin.kucoinPrice.toFixed(6)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Amount: {amount} coins</p>
                          <p className={`font-medium ${netProfit > 0 ? "text-green-600" : "text-red-600"}`}>
                            Net Profit: ${netProfit.toFixed(4)}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div
                          className={`flex items-center ${coin.profitPercent > 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {coin.profitPercent > 0 ? (
                            <TrendingUp className="h-4 w-4 mr-1" />
                          ) : (
                            <TrendingDown className="h-4 w-4 mr-1" />
                          )}
                          <span className="font-medium">{coin.profitPercent.toFixed(2)}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">${coin.priceDiff.toFixed(6)} diff</p>
                      </div>
                      <Button onClick={() => executeTrade(coin)} disabled={!isProfitable || isSuspicious} size="sm">
                        Trade
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Trade History */}
      <Card>
        <CardHeader>
          <CardTitle>Trade History</CardTitle>
          <CardDescription>Detailed log of all executed trades with error details</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <div className="space-y-4">
              {trades.map((trade) => (
                <div key={trade.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <h4 className="font-semibold">{trade.coinName}</h4>
                      <Badge
                        variant={
                          trade.status === "completed"
                            ? "default"
                            : trade.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {trade.status}
                      </Badge>
                    </div>
                    <div className={`font-medium ${trade.netProfit > 0 ? "text-green-600" : "text-red-600"}`}>
                      ${trade.netProfit.toFixed(4)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p>
                        <span className="font-medium">Buy:</span> {trade.buyExchange} @ ${trade.buyPrice.toFixed(6)}
                      </p>
                      <p>
                        <span className="font-medium">Sell:</span> {trade.sellExchange} @ ${trade.sellPrice.toFixed(6)}
                      </p>
                      <p>
                        <span className="font-medium">Amount:</span> {trade.amount} coins
                      </p>
                    </div>
                    <div>
                      <p>
                        <span className="font-medium">Buy Fee:</span> ${trade.buyFee.toFixed(4)}
                      </p>
                      <p>
                        <span className="font-medium">Sell Fee:</span> ${trade.sellFee.toFixed(4)}
                      </p>
                      <p>
                        <span className="font-medium">Executed:</span> {new Date(trade.executionTime).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <Separator className="my-2" />

                  <div className="flex space-x-4 text-xs">
                    <span
                      className={`px-2 py-1 rounded ${trade.buyExecuted ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                    >
                      Buy: {trade.buyExecuted ? "Executed" : "Failed"}
                    </span>
                    <span
                      className={`px-2 py-1 rounded ${trade.sellExecuted ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                    >
                      Sell: {trade.sellExecuted ? "Executed" : "Failed"}
                    </span>
                  </div>

                  {/* Error Details */}
                  {(trade.errors?.buy || trade.errors?.sell) && (
                    <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs">
                      <p className="font-medium text-red-800 mb-1">Error Details:</p>
                      {trade.errors.buy && (
                        <p className="text-red-700">
                          <span className="font-medium">Buy Error:</span> {trade.errors.buy}
                        </p>
                      )}
                      {trade.errors.sell && (
                        <p className="text-red-700">
                          <span className="font-medium">Sell Error:</span> {trade.errors.sell}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {trades.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No trades executed yet</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
