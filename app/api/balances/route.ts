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

export async function GET() {
  try {
    const okxApiKey = process.env.OKX_API_KEY
    const okxSecretKey = process.env.OKX_SECRET_KEY
    const okxPassphrase = process.env.OKX_PASSPHRASE

    const kucoinApiKey = process.env.KUCOIN_API_KEY
    const kucoinSecretKey = process.env.KUCOIN_SECRET_KEY
    const kucoinPassphrase = process.env.KUCOIN_PASSPHRASE

    if (!okxApiKey || !okxSecretKey || !okxPassphrase || !kucoinApiKey || !kucoinSecretKey || !kucoinPassphrase) {
      console.error("Missing API credentials")
      return NextResponse.json(
        {
          error: "Missing API credentials - please configure exchange API keys",
          okxCredentials: !!okxApiKey && !!okxSecretKey && !!okxPassphrase,
          kucoinCredentials: !!kucoinApiKey && !!kucoinSecretKey && !!kucoinPassphrase,
        },
        { status: 400 },
      )
    }

    console.log("Fetching real exchange balances...")

    // Fetch OKX balance
    let okxBalance = 0
    let okxError = null
    try {
      const okxTimestamp = new Date().toISOString()
      const okxMethod = "GET"
      const okxRequestPath = "/api/v5/account/balance"
      const okxSignature = createOKXSignature(okxTimestamp, okxMethod, okxRequestPath, "", okxSecretKey)

      console.log("Fetching OKX balance...")
      const okxResponse = await fetch(`https://www.okx.com${okxRequestPath}`, {
        method: okxMethod,
        headers: {
          "OK-ACCESS-KEY": okxApiKey,
          "OK-ACCESS-SIGN": okxSignature,
          "OK-ACCESS-TIMESTAMP": okxTimestamp,
          "OK-ACCESS-PASSPHRASE": okxPassphrase,
          "Content-Type": "application/json",
        },
      })

      const okxData = await okxResponse.json()
      console.log("OKX balance response:", JSON.stringify(okxData, null, 2))

      if (okxResponse.ok && okxData.code === "0") {
        if (okxData.data && okxData.data.length > 0) {
          const usdtBalance = okxData.data[0]?.details?.find((detail: any) => detail.ccy === "USDT")
          okxBalance = Number.parseFloat(usdtBalance?.availBal || "0")
          console.log(`OKX USDT balance: ${okxBalance}`)
        }
      } else {
        okxError = `OKX API Error: ${okxData.msg || okxData.error_message || "Unknown error"}`
        console.error(okxError)
      }
    } catch (error) {
      okxError = `OKX fetch error: ${error.message}`
      console.error("OKX balance fetch error:", error)
    }

    // Fetch KuCoin balance with multiple account types
    let kucoinBalance = 0
    let kucoinError = null
    try {
      const kucoinTimestamp = Date.now().toString()
      const kucoinMethod = "GET"
      const kucoinRequestPath = "/api/v1/accounts"
      const kucoinSignature = createKuCoinSignature(
        kucoinTimestamp,
        kucoinMethod,
        kucoinRequestPath,
        "",
        kucoinSecretKey,
      )

      const encodedPassphrase = createKuCoinPassphraseSignature(kucoinPassphrase, kucoinSecretKey)

      console.log("Fetching KuCoin balance...")
      const kucoinResponse = await fetch(`https://api.kucoin.com${kucoinRequestPath}`, {
        method: kucoinMethod,
        headers: {
          "KC-API-KEY": kucoinApiKey,
          "KC-API-SIGN": kucoinSignature,
          "KC-API-TIMESTAMP": kucoinTimestamp,
          "KC-API-PASSPHRASE": encodedPassphrase,
          "KC-API-KEY-VERSION": "2",
          "Content-Type": "application/json",
        },
      })

      const kucoinData = await kucoinResponse.json()
      console.log("KuCoin balance response:", JSON.stringify(kucoinData, null, 2))

      if (kucoinResponse.ok && kucoinData.code === "200000") {
        if (kucoinData.data && Array.isArray(kucoinData.data)) {
          // Check all account types for USDT
          const usdtAccounts = kucoinData.data.filter((account: any) => account.currency === "USDT")
          console.log("Found USDT accounts:", usdtAccounts)

          // Sum up all USDT balances (trade, main, margin accounts)
          let totalUsdtBalance = 0
          usdtAccounts.forEach((account: any) => {
            const available = Number.parseFloat(account.available || "0")
            const balance = Number.parseFloat(account.balance || "0")
            totalUsdtBalance += Math.max(available, balance)
            console.log(`KuCoin ${account.type} account USDT: available=${available}, balance=${balance}`)
          })

          kucoinBalance = totalUsdtBalance
          console.log(`Total KuCoin USDT balance: ${kucoinBalance}`)
        }
      } else {
        kucoinError = `KuCoin API Error: ${kucoinData.msg || kucoinData.message || "Unknown error"}`
        console.error(kucoinError)
      }
    } catch (error) {
      kucoinError = `KuCoin fetch error: ${error.message}`
      console.error("KuCoin balance fetch error:", error)
    }

    return NextResponse.json({
      okx: okxBalance,
      kucoin: kucoinBalance,
      timestamp: new Date().toISOString(),
      errors: {
        okx: okxError,
        kucoin: kucoinError,
      },
      debug: {
        okxCredentials: !!okxApiKey && !!okxSecretKey && !!okxPassphrase,
        kucoinCredentials: !!kucoinApiKey && !!kucoinSecretKey && !!kucoinPassphrase,
      },
    })
  } catch (error) {
    console.error("Error fetching balances:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch balances from exchanges",
        message: error.message,
        timestamp: new Date().toISOString(),
        okx: 0,
        kucoin: 0,
      },
      { status: 500 },
    )
  }
}
