import { NextResponse } from "next/server"
import crypto from "crypto"

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

async function executeOKXOrder(
  symbol: string,
  side: "buy" | "sell",
  amount: number,
  apiKey: string,
  secretKey: string,
  passphrase: string,
) {
  try {
    const timestamp = new Date().toISOString()
    const method = "POST"
    const requestPath = "/api/v5/trade/order"

    const orderData = {
      instId: `${symbol}-USDT`,
      tdMode: "cash",
      side,
      ordType: "market",
      sz: amount.toString(),
    }

    const body = JSON.stringify(orderData)
    const signature = createOKXSignature(timestamp, method, requestPath, body, secretKey)

    console.log(`Executing OKX ${side} order for ${symbol}:`, orderData)

    const response = await fetch(`https://www.okx.com${requestPath}`, {
      method,
      headers: {
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
      },
      body,
    })

    const result = await response.json()
    console.log(`OKX ${side} order response:`, JSON.stringify(result, null, 2))

    const success = response.ok && result.code === "0"
    return {
      success,
      data: result,
      orderId: result.data?.[0]?.ordId,
      error: success ? null : `OKX Error: ${result.msg || result.error_message || "Unknown error"}`,
      details: {
        httpStatus: response.status,
        responseCode: result.code,
        message: result.msg,
        orderData,
      },
    }
  } catch (error) {
    console.error("OKX order error:", error)
    return {
      success: false,
      error: `OKX Network Error: ${error.message}`,
      details: { networkError: error.message },
    }
  }
}

async function executeKuCoinOrder(
  symbol: string,
  side: "buy" | "sell",
  amount: number,
  apiKey: string,
  secretKey: string,
  passphrase: string,
) {
  try {
    const timestamp = Date.now().toString()
    const method = "POST"
    const requestPath = "/api/v1/orders"

    const orderData = {
      symbol: `${symbol}-USDT`,
      side,
      type: "market",
      size: amount.toString(),
    }

    const body = JSON.stringify(orderData)
    const signature = createKuCoinSignature(timestamp, method, requestPath, body, secretKey)
    const encodedPassphrase = createKuCoinPassphraseSignature(passphrase, secretKey)

    console.log(`Executing KuCoin ${side} order for ${symbol}:`, orderData)

    const response = await fetch(`https://api.kucoin.com${requestPath}`, {
      method,
      headers: {
        "KC-API-KEY": apiKey,
        "KC-API-SIGN": signature,
        "KC-API-TIMESTAMP": timestamp,
        "KC-API-PASSPHRASE": encodedPassphrase,
        "KC-API-KEY-VERSION": "2",
        "Content-Type": "application/json",
      },
      body,
    })

    const result = await response.json()
    console.log(`KuCoin ${side} order response:`, JSON.stringify(result, null, 2))

    const success = response.ok && result.code === "200000"
    return {
      success,
      data: result,
      orderId: result.data?.orderId,
      error: success ? null : `KuCoin Error: ${result.msg || result.message || "Unknown error"}`,
      details: {
        httpStatus: response.status,
        responseCode: result.code,
        message: result.msg || result.message,
        orderData,
      },
    }
  } catch (error) {
    console.error("KuCoin order error:", error)
    return {
      success: false,
      error: `KuCoin Network Error: ${error.message}`,
      details: { networkError: error.message },
    }
  }
}

export async function POST(request: Request) {
  try {
    const { symbol, amount, buyExchange, sellExchange, tradeId } = await request.json()

    console.log(`Starting trade execution for ${symbol}:`, {
      amount,
      buyExchange,
      sellExchange,
      tradeId,
    })

    const okxApiKey = process.env.OKX_API_KEY!
    const okxSecretKey = process.env.OKX_SECRET_KEY!
    const okxPassphrase = process.env.OKX_PASSPHRASE!

    const kucoinApiKey = process.env.KUCOIN_API_KEY!
    const kucoinSecretKey = process.env.KUCOIN_SECRET_KEY!
    const kucoinPassphrase = process.env.KUCOIN_PASSPHRASE!

    let buyResult, sellResult

    // Execute buy order
    console.log(`Executing buy order on ${buyExchange}...`)
    if (buyExchange === "OKX") {
      buyResult = await executeOKXOrder(symbol, "buy", amount, okxApiKey, okxSecretKey, okxPassphrase)
    } else {
      buyResult = await executeKuCoinOrder(symbol, "buy", amount, kucoinApiKey, kucoinSecretKey, kucoinPassphrase)
    }

    console.log("Buy order result:", buyResult)

    // Only execute sell order if buy was successful
    if (buyResult.success) {
      console.log("Buy order successful, waiting 2 seconds before sell order...")
      await new Promise((resolve) => setTimeout(resolve, 2000))

      console.log(`Executing sell order on ${sellExchange}...`)
      if (sellExchange === "OKX") {
        sellResult = await executeOKXOrder(symbol, "sell", amount, okxApiKey, okxSecretKey, okxPassphrase)
      } else {
        sellResult = await executeKuCoinOrder(symbol, "sell", amount, kucoinApiKey, kucoinSecretKey, kucoinPassphrase)
      }
    } else {
      console.log("Buy order failed, skipping sell order")
      sellResult = {
        success: false,
        error: "Buy order failed, sell order not executed",
        details: { reason: "buy_order_failed" },
      }
    }

    console.log("Sell order result:", sellResult)

    const response = {
      success: buyResult.success && sellResult.success,
      buyExecuted: buyResult.success,
      sellExecuted: sellResult.success,
      buyOrderId: buyResult.orderId,
      sellOrderId: sellResult.orderId,
      buyData: buyResult.data,
      sellData: sellResult.data,
      tradeId,
      timestamp: new Date().toISOString(),
      errors: {
        buy: buyResult.error,
        sell: sellResult.error,
      },
      details: {
        buy: buyResult.details,
        sell: sellResult.details,
      },
    }

    console.log("Final trade response:", response)
    return NextResponse.json(response)
  } catch (error) {
    console.error("Trade execution error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Trade execution failed",
        buyExecuted: false,
        sellExecuted: false,
        details: {
          systemError: error.message,
        },
      },
      { status: 500 },
    )
  }
}
