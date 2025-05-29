"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowDownIcon, ArrowUpIcon, RefreshCwIcon } from "lucide-react"
import { ErrorBoundary } from "@/components/error-boundary"

// Define types for better type safety
interface Coin {
  symbol: string
  okxPrice: number
  kucoinPrice: number
  priceDiff: number
  profitPercent: number
  netProfit: number
  buyExchange: string
  sellExchange: string
  estimatedAmount: number
  lastUpdated: string
}

interface Trade {
  id: string
  coinName: string
  status: "pending" | "completed" | "failed"
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
  errors?: {
    buy?: string
    sell?: string
  }
}

interface BalanceInfo {
  OKX: number
  KuCoin: number
}

export default function Home() {
  const [coins, setCoins] = useState<Coin[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [balances, setBalances] = useState<BalanceInfo>({ OKX: 0, KuCoin: 0 })
  const [error, setError] = useState<string | null>(null)

  // Fetch prices on component mount and when refresh is triggered
  useEffect(() => {
    fetchPrices()
    fetchBalances()
    // Also fetch trades on mount
    fetchTrades()
  }, [])

  // Function to fetch balances
  const fetchBalances = async () => {
    try {
      const response = await fetch("/api/balances")
      if (!response.ok) {
        throw new Error(`Failed to fetch balances: ${response.status} ${response.statusText}`)
      }
      const data = await response.json()
      
      // Safely extract balances with fallbacks
      const okxBalance = data?.okx?.success ? (data.okx.balances?.USDT || 0) : 0
      const kucoinBalance = data?.kucoin?.success ? (data.kucoin.balances?.USDT || 0) : 0
      
      setBalances({
        OKX: okxBalance,
        KuCoin: kucoinBalance
      })
    } catch (error) {
      console.error("Error fetching balances:", error)
      // Don't set error state here to avoid breaking the UI
      // Just log it and continue with default values
    }
  }

  // Function to fetch prices
  const fetchPrices = async () => {
    try {
      setLoading(true)
      setRefreshing(true)
      setError(null)
      
      const response = await fetch("/api/prices")
      if (!response.ok) {
        throw new Error(`Failed to fetch prices: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      
      // Safely handle the response
      if (data && Array.isArray(data.coins)) {
        setCoins(data.coins)
      } else {
        // If data.coins is not an array, set empty array
        setCoins([])
        console.warn("Unexpected response format:", data)
      }
    } catch (error) {
      console.error("Error fetching prices:", error)
      setError(error instanceof Error ? error.message : "Failed to fetch prices")
      setCoins([]) // Set empty array on error
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Function to fetch trade history
  const fetchTrades = async () => {
    try {
      const response = await fetch("/api/trades")
      if (!response.ok) {
        // Don't throw error for trades, just log it
        console.error(`Failed to fetch trades: ${response.status} ${response.statusText}`)
        return
      }
      
      const data = await response.json()
      
      // Safely handle the response
      if (data && Array.isArray(data.trades)) {
        setTrades(data.trades)
      } else {
        // If data.trades is not an array, keep current state
        console.warn("Unexpected trades response format:", data)
      }
    } catch (error) {
      console.error("Error fetching trades:", error)
      // Don't update state on error to keep existing trades
    }
  }

  // Function to execute a trade
  const executeTrade = async (coin: Coin) => {
    try {
      // Create a new pending trade
      const tradeId = Date.now().toString()
      const newTrade: Trade = {
        id: tradeId,
        coinName: coin.symbol,
        status: "pending",
        buyExchange: coin.buyExchange,
        sellExchange: coin.sellExchange,
        buyPrice: coin.buyExchange === "OKX" ? coin.okxPrice : coin.kucoinPrice,
        sellPrice: coin.sellExchange === "OKX" ? coin.okxPrice : coin.kucoinPrice,
        amount: coin.estimatedAmount,
        buyFee: 0.0005,
        sellFee: 0.0005,
        netProfit: coin.netProfit,
        executionTime: new Date().toISOString(),
        buyExecuted: false,
        sellExecuted: false,
      }

      // Add the pending trade to the list
      setTrades((prevTrades) => [newTrade, ...prevTrades])

      // Execute the trade
      const response = await fetch("/api/execute-trade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: coin.symbol,
          amount: coin.estimatedAmount,
          buyExchange: coin.buyExchange,
          sellExchange: coin.sellExchange,
          tradeId,
        }),
      })

      const result = await response.json()

      // Update the trade with the result
      setTrades((prevTrades) =>
        prevTrades.map((trade) => {
          if (trade.id === tradeId) {
            return {
              ...trade,
              status: result.success ? "completed" : "failed",
              buyExecuted: result.buyExecuted || false,
              sellExecuted: result.sellExecuted || false,
              errors: result.errors || {},
            }
          }
          return trade
        })
      )

      // Refresh balances after trade
      fetchBalances()
      
      // Refresh prices after trade
      fetchPrices()
    } catch (error) {
      console.error("Error executing trade:", error)
      
      // Update the trade with the error
      setTrades((prevTrades) =>
        prevTrades.map((trade) => {
          if (trade.id === Date.now().toString()) {
            return {
              ...trade,
              status: "failed",
              errors: {
                buy: error instanceof Error ? error.message : "Unknown error occurred",
              },
            }
          }
          return trade
        })
      )
    }
  }

  // Function to check if a coin is profitable
  const isProfitable = (coin: Coin) => {
    return coin.profitPercent > 0.5
  }

  // Function to check if a coin's profit is suspiciously high
  const isSuspicious = (coin: Coin) => {
    return coin.profitPercent > 50
  }

  // Function to check if a coin is tradeable with current balance
  const isTradeable = (coin: Coin) => {
    // Get the buy exchange balance
    const buyExchangeBalance = coin.buyExchange === "OKX" ? balances.OKX : balances.KuCoin
    
    // Calculate the required amount in USDT
    const buyPrice = coin.buyExchange === "OKX" ? coin.okxPrice : coin.kucoinPrice
    const requiredAmount = buyPrice * coin.estimatedAmount
    
    // Add 0.1% for fees
    const requiredAmountWithFees = requiredAmount * 1.001
    
    // Check if we have enough balance
    return buyExchangeBalance >= requiredAmountWithFees
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Crypto Arbitrage Bot</h1>
          <p className="text-muted-foreground">Find and execute arbitrage opportunities between OKX and KuCoin</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm">
            <div className="font-medium">OKX Balance</div>
            <div className="text-muted-foreground">{balances.OKX.toFixed(4)} USDT</div>
          </div>
          <div className="text-sm">
            <div className="font-medium">KuCoin Balance</div>
            <div className="text-muted-foreground">{balances.KuCoin.toFixed(4)} USDT</div>
          </div>
          <Button onClick={fetchPrices} disabled={refreshing}>
            <RefreshCwIcon className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded relative">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {/* Arbitrage Opportunities */}
      <Card>
        <CardHeader>
          <CardTitle>Arbitrage Opportunities</CardTitle>
          <CardDescription>
            Showing coins with price differences between OKX and KuCoin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-96">
            <div className="space-y-4">
              {loading && !refreshing ? (
                <div className="text-center py-8 text-muted-foreground">Loading opportunities...</div>
              ) : coins && coins.length > 0 ? (
                coins.map((coin, index) => {
                  // Safely check if coin has all required properties
                  if (!coin || typeof coin.symbol !== 'string') {
                    return null;
                  }
                  
                  // Determine if this opportunity is tradeable with current balance
                  const canTrade = isTradeable(coin);
                  
                  return (
                    <div key={`${coin.symbol}-${index}`} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{coin.symbol}</h3>
                          <div className="grid grid-cols-2 gap-4 text-sm mt-1">
                            <div>
                              <p>
                                <span className="font-medium">Buy:</span> {coin.buyExchange} @ $
                                {coin.buyExchange === "OKX"
                                  ? coin.okxPrice.toFixed(6)
                                  : coin.kucoinPrice.toFixed(6)}
                              </p>
                              <p>
                                <span className="font-medium">Sell:</span> {coin.sellExchange} @ $
                                {coin.sellExchange === "OKX"
                                  ? coin.okxPrice.toFixed(6)
                                  : coin.kucoinPrice.toFixed(6)}
                              </p>
                            </div>
                            <div>
                              <p>
                                <span className="font-medium">Amount:</span> {coin.estimatedAmount} coins
                              </p>
                              <p>
                                <span className="font-medium">Net Profit:</span> ${coin.netProfit.toFixed(4)}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                          <div className="flex items-center">
                            {coin.profitPercent > 0 ? (
                              <ArrowUpIcon className="text-green-600 h-4 w-4 mr-1" />
                            ) : (
                              <ArrowDownIcon className="text-red-600 h-4 w-4 mr-1" />
                            )}
                            <span className="font-medium">{coin.profitPercent.toFixed(2)}%</span>
                          </div>
                          <p className="text-xs text-muted-foreground">${coin.priceDiff.toFixed(6)} diff</p>
                          
                          {!canTrade && (
                            <p className="text-xs text-red-600 mb-2">
                              Insufficient balance on {coin.buyExchange}
                            </p>
                          )}
                          
                          <Button 
                            onClick={() => executeTrade(coin)} 
                            disabled={!isProfitable(coin) || isSuspicious(coin) || !canTrade} 
                            size="sm"
                          >
                            Trade
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">No arbitrage opportunities found</div>
              )}
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
              {trades && trades.length > 0 ? trades.map((trade) => (
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
              )) : (
                <div className="text-center py-8 text-muted-foreground">No trades executed yet</div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
