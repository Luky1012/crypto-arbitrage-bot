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

// Detailed error handling for OKX orders with proper TypeScript typing
async function executeOKXOrder(
  symbol: string,
  side: "buy" | "sell",
  amount: number,
  apiKey: string | undefined,
  secretKey: string | undefined,
  passphrase: string | undefined,
) {
  try {
    // Validate API credentials
    if (!apiKey || !secretKey || !passphrase) {
      return {
        success: false,
        error: "OKX Error: Missing API credentials",
        details: { 
          missingCredentials: true,
          message: "API key, secret key, and passphrase are all required for OKX trading"
        },
      }
    }

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
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    
    try {
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
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      const result = await response.json()
      console.log(`OKX ${side} order response:`, JSON.stringify(result, null, 2))
      
      // Check for specific error codes and provide detailed messages
      if (!response.ok) {
        return {
          success: false,
          error: `OKX Error: HTTP ${response.status} - ${response.statusText}`,
          details: {
            httpStatus: response.status,
            httpStatusText: response.statusText,
            responseBody: result
          }
        }
      }
      
      if (result.code !== "0") {
        let detailedError = "Unknown error";
        
        // Map common OKX error codes to user-friendly messages
        const errorCodeMap: Record<string, string> = {
          "50001": "Invalid API key - please check your API credentials",
          "50002": "Invalid signature - please check your API secret",
          "50004": "Invalid passphrase - please check your API passphrase",
          "50007": "API key expired - please generate a new API key",
          "51000": "Parameter error - check order parameters",
          "51001": "Instrument ID does not exist - check the trading pair",
          "51002": "Order quantity too small",
          "51003": "Order price out of permissible range",
          "51004": "Insufficient balance to place order",
          "51008": "Order placement failed - service unavailable",
          "51009": "Exceeded order limit - too many orders",
          "51012": "Trading suspended for this instrument",
          "51022": "Trading not yet started for this instrument"
        };
        
        if (result.code in errorCodeMap) {
          detailedError = errorCodeMap[result.code];
        } else if (result.msg) {
          detailedError = result.msg;
        }
        
        return {
          success: false,
          error: `OKX Error: ${detailedError}`,
          details: {
            code: result.code,
            message: result.msg,
            orderData,
            errorType: "api_error"
          }
        }
      }
      
      // Check for successful order but with no order ID
      if (!result.data || !result.data[0] || !result.data[0].ordId) {
        return {
          success: false,
          error: "OKX Error: Order response missing order ID",
          details: {
            responseData: result.data,
            orderData,
            errorType: "missing_order_id"
          }
        }
      }
      
      return {
        success: true,
        data: result,
        orderId: result.data[0].ordId,
        error: null,
        details: {
          httpStatus: response.status,
          responseCode: result.code,
          message: result.msg,
          orderData,
        },
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      // Handle timeout errors specifically
      if (fetchError.name === 'AbortError') {
        return {
          success: false,
          error: "OKX Error: Request timed out after 15 seconds",
          details: { 
            errorType: "timeout",
            orderData
          }
        }
      }
      
      // Handle network errors
      return {
        success: false,
        error: `OKX Network Error: ${fetchError.message}`,
        details: { 
          networkError: fetchError.message,
          errorType: "network_error",
          orderData
        }
      }
    }
  } catch (error: any) {
    console.error("OKX order error:", error)
    return {
      success: false,
      error: `OKX Error: ${error.message || "Unknown error"}`,
      details: { 
        errorMessage: error.message,
        errorType: "unexpected_error",
        errorStack: error.stack
      }
    }
  }
}

// Detailed error handling for KuCoin orders with proper TypeScript typing
async function executeKuCoinOrder(
  symbol: string,
  side: "buy" | "sell",
  amount: number,
  apiKey: string | undefined,
  secretKey: string | undefined,
  passphrase: string | undefined,
) {
  try {
    // Validate API credentials
    if (!apiKey || !secretKey || !passphrase) {
      return {
        success: false,
        error: "KuCoin Error: Missing API credentials",
        details: { 
          missingCredentials: true,
          message: "API key, secret key, and passphrase are all required for KuCoin trading"
        },
      }
    }

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
    
    // Add timeout to prevent hanging requests
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    
    try {
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
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      const result = await response.json()
      console.log(`KuCoin ${side} order response:`, JSON.stringify(result, null, 2))
      
      // Check for specific error codes and provide detailed messages
      if (!response.ok) {
        return {
          success: false,
          error: `KuCoin Error: HTTP ${response.status} - ${response.statusText}`,
          details: {
            httpStatus: response.status,
            httpStatusText: response.statusText,
            responseBody: result
          }
        }
      }
      
      if (result.code !== "200000") {
        let detailedError = "Unknown error";
        
        // Map common KuCoin error codes to user-friendly messages
        const errorCodeMap: Record<string, string> = {
          "400100": "Parameter error - check order parameters",
          "400200": "Balance insufficient - not enough funds to place order",
          "400500": "Invalid operation - order cannot be placed",
          "400600": "Server error - please try again later",
          "400700": "Exceeded rate limit - too many requests",
          "401000": "Invalid API key - please check your API credentials",
          "401100": "Invalid signature - please check your API secret",
          "401200": "Invalid passphrase - please check your API passphrase",
          "401300": "API key expired - please generate a new API key",
          "500000": "Internal server error - please try again later"
        };
        
        if (result.code in errorCodeMap) {
          detailedError = errorCodeMap[result.code];
        } else if (result.msg) {
          detailedError = result.msg;
        }
        
        return {
          success: false,
          error: `KuCoin Error: ${detailedError}`,
          details: {
            code: result.code,
            message: result.msg || result.message,
            orderData,
            errorType: "api_error"
          }
        }
      }
      
      // Check for successful order but with no order ID
      if (!result.data || !result.data.orderId) {
        return {
          success: false,
          error: "KuCoin Error: Order response missing order ID",
          details: {
            responseData: result.data,
            orderData,
            errorType: "missing_order_id"
          }
        }
      }
      
      return {
        success: true,
        data: result,
        orderId: result.data.orderId,
        error: null,
        details: {
          httpStatus: response.status,
          responseCode: result.code,
          message: result.msg || result.message,
          orderData,
        },
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      // Handle timeout errors specifically
      if (fetchError.name === 'AbortError') {
        return {
          success: false,
          error: "KuCoin Error: Request timed out after 15 seconds",
          details: { 
            errorType: "timeout",
            orderData
          }
        }
      }
      
      // Handle network errors
      return {
        success: false,
        error: `KuCoin Network Error: ${fetchError.message}`,
        details: { 
          networkError: fetchError.message,
          errorType: "network_error",
          orderData
        }
      }
    }
  } catch (error: any) {
    console.error("KuCoin order error:", error)
    return {
      success: false,
      error: `KuCoin Error: ${error.message || "Unknown error"}`,
      details: { 
        errorMessage: error.message,
        errorType: "unexpected_error",
        errorStack: error.stack
      }
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
    
    // Validate input parameters
    if (!symbol || !amount || !buyExchange || !sellExchange) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required parameters",
          details: {
            missingParams: {
              symbol: !symbol,
              amount: !amount,
              buyExchange: !buyExchange,
              sellExchange: !sellExchange
            }
          }
        },
        { status: 400 }
      )
    }
    
    // Validate amount is positive
    if (amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid amount: must be greater than zero",
          details: { providedAmount: amount }
        },
        { status: 400 }
      )
    }
    
    // Validate exchanges
    if (buyExchange !== "OKX" && buyExchange !== "KuCoin") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid buy exchange: must be OKX or KuCoin",
          details: { providedExchange: buyExchange }
        },
        { status: 400 }
      )
    }
    
    if (sellExchange !== "OKX" && sellExchange !== "KuCoin") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid sell exchange: must be OKX or KuCoin",
          details: { providedExchange: sellExchange }
        },
        { status: 400 }
      )
    }
    
    const okxApiKey = process.env.OKX_API_KEY
    const okxSecretKey = process.env.OKX_SECRET_KEY
    const okxPassphrase = process.env.OKX_PASSPHRASE
    const kucoinApiKey = process.env.KUCOIN_API_KEY
    const kucoinSecretKey = process.env.KUCOIN_SECRET_KEY
    const kucoinPassphrase = process.env.KUCOIN_PASSPHRASE
    
    // Check if API keys are configured
    if ((buyExchange === "OKX" || sellExchange === "OKX") && 
        (!okxApiKey || !okxSecretKey || !okxPassphrase)) {
      return NextResponse.json(
        {
          success: false,
          error: "OKX API credentials not configured",
          details: {
            missingCredentials: {
              apiKey: !okxApiKey,
              secretKey: !okxSecretKey,
              passphrase: !okxPassphrase
            }
          }
        },
        { status: 500 }
      )
    }
    
    if ((buyExchange === "KuCoin" || sellExchange === "KuCoin") && 
        (!kucoinApiKey || !kucoinSecretKey || !kucoinPassphrase)) {
      return NextResponse.json(
        {
          success: false,
          error: "KuCoin API credentials not configured",
          details: {
            missingCredentials: {
              apiKey: !kucoinApiKey,
              secretKey: !kucoinSecretKey,
              passphrase: !kucoinPassphrase
            }
          }
        },
        { status: 500 }
      )
    }

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
        details: { 
          reason: "buy_order_failed",
          buyError: buyResult.error,
          buyDetails: buyResult.details
        },
      }
    }
    console.log("Sell order result:", sellResult)
    
    // Prepare detailed response
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
        symbol,
        amount,
        buyExchange,
        sellExchange
      },
    }
    console.log("Final trade response:", response)
    return NextResponse.json(response)
  } catch (error: any) {
    console.error("Trade execution error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Trade execution failed: " + (error.message || "Unknown error"),
        buyExecuted: false,
        sellExecuted: false,
        details: {
          systemError: error.message,
          errorStack: error.stack,
          errorType: "unexpected_error"
        },
      },
      { status: 500 },
    )
  }
}
