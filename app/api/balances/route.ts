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
  try {
    return crypto.createHmac("sha256", secretKey).update(passphrase).digest("base64")
  } catch (error: any) {
    console.error("Error creating KuCoin passphrase signature:", error);
    throw new Error(`Failed to create KuCoin passphrase signature: ${error.message}`);
  }
}

// Enhanced error handling for fetching OKX balances
async function fetchOKXBalance(
  apiKey: string | undefined,
  secretKey: string | undefined,
  passphrase: string | undefined,
) {
  try {
    // Validate API credentials
    if (!apiKey || !secretKey || !passphrase) {
      const missingCredentials = {
        apiKey: !apiKey,
        secretKey: !secretKey,
        passphrase: !passphrase
      };
      
      console.error("OKX missing credentials:", missingCredentials);
      
      return {
        success: false,
        error: `OKX Error: Missing API credentials - ${Object.entries(missingCredentials)
          .filter(([_, isMissing]) => isMissing)
          .map(([key]) => key)
          .join(", ")} not provided`,
        balances: {},
        details: { 
          missingCredentials,
          message: "API key, secret key, and passphrase are all required for OKX balance fetching",
          errorType: "missing_credentials"
        },
      }
    }

    const timestamp = new Date().toISOString()
    const method = "GET"
    const requestPath = "/api/v5/account/balance?ccy=USDT"
    const body = ""
    
    try {
      const signature = createOKXSignature(timestamp, method, requestPath, body, secretKey)
      console.log("Fetching OKX balance...")
      
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
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        // Parse response body
        let responseText;
        let result;
        
        try {
          responseText = await response.text();
          console.log("OKX balance raw response:", responseText);
          
          try {
            result = JSON.parse(responseText);
          } catch (jsonError: any) {
            console.error("OKX JSON parsing error:", jsonError);
            return {
              success: false,
              error: `OKX Error: Invalid JSON response - ${jsonError.message}`,
              balances: {},
              details: {
                httpStatus: response.status,
                httpStatusText: response.statusText,
                responseText,
                parseError: jsonError.message,
                errorType: "json_parse_error"
              }
            };
          }
        } catch (textError: any) {
          console.error("OKX response text extraction error:", textError);
          return {
            success: false,
            error: `OKX Error: Failed to extract response text - ${textError.message}`,
            balances: {},
            details: {
              httpStatus: response.status,
              httpStatusText: response.statusText,
              parseError: textError.message,
              errorType: "response_text_error"
            }
          };
        }
        
        console.log("OKX balance response:", JSON.stringify(result, null, 2))
        
        // Check for specific error codes and provide detailed messages
        if (!response.ok) {
          return {
            success: false,
            error: `OKX Error: HTTP ${response.status} - ${response.statusText} - Raw response: ${responseText}`,
            balances: {},
            details: {
              httpStatus: response.status,
              httpStatusText: response.statusText,
              responseBody: result,
              rawResponse: responseText,
              errorType: "http_error"
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
            "1": "General error - see raw response for details"
          };
          
          if (result.code in errorCodeMap) {
            detailedError = errorCodeMap[result.code];
          } else if (result.msg) {
            detailedError = result.msg;
          }
          
          return {
            success: false,
            error: `OKX Error: ${detailedError} (Code: ${result.code}) - Raw response: ${responseText}`,
            balances: {},
            details: {
              code: result.code,
              message: result.msg,
              errorType: "api_error",
              responseBody: result,
              rawResponse: responseText
            }
          }
        }
        
        // Extract USDT balance
        let availableUSDT = 0;
        
        if (result.data && Array.isArray(result.data) && result.data.length > 0) {
          const accountData = result.data[0];
          
          if (accountData.details && Array.isArray(accountData.details)) {
            for (const currency of accountData.details) {
              if (currency.ccy === "USDT") {
                // availBal is the available balance that can be used for trading
                availableUSDT = parseFloat(currency.availBal || "0");
                break;
              }
            }
          }
        }
        
        return {
          success: true,
          balances: {
            USDT: availableUSDT
          },
          error: null,
          details: {
            httpStatus: response.status,
            responseCode: result.code,
            message: result.msg,
            responseBody: result
          },
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        
        // Handle timeout errors specifically
        if (fetchError.name === 'AbortError') {
          return {
            success: false,
            error: "OKX Error: Request timed out after 15 seconds",
            balances: {},
            details: { 
              errorType: "timeout",
              errorMessage: fetchError.message,
              errorStack: fetchError.stack
            }
          }
        }
        
        // Handle network errors
        return {
          success: false,
          error: `OKX Network Error: ${fetchError.message}`,
          balances: {},
          details: { 
            networkError: fetchError.message,
            errorType: "network_error",
            errorStack: fetchError.stack
          }
        }
      }
    } catch (signatureError: any) {
      console.error("OKX signature creation error:", signatureError);
      return {
        success: false,
        error: `OKX Error: Failed to create signature - ${signatureError.message}`,
        balances: {},
        details: {
          errorMessage: signatureError.message,
          errorType: "signature_error",
          errorStack: signatureError.stack
        }
      };
    }
  } catch (error: any) {
    console.error("OKX balance error:", error)
    return {
      success: false,
      error: `OKX Error: ${error.message || "Unknown error"}`,
      balances: {},
      details: { 
        errorMessage: error.message,
        errorType: "unexpected_error",
        errorStack: error.stack
      }
    }
  }
}

// Enhanced error handling for fetching KuCoin balances
async function fetchKuCoinBalance(
  apiKey: string | undefined,
  secretKey: string | undefined,
  passphrase: string | undefined,
) {
  try {
    // Validate API credentials
    if (!apiKey || !secretKey || !passphrase) {
      const missingCredentials = {
        apiKey: !apiKey,
        secretKey: !secretKey,
        passphrase: !passphrase
      };
      
      console.error("KuCoin missing credentials:", missingCredentials);
      
      return {
        success: false,
        error: `KuCoin Error: Missing API credentials - ${Object.entries(missingCredentials)
          .filter(([_, isMissing]) => isMissing)
          .map(([key]) => key)
          .join(", ")} not provided`,
        balances: {},
        details: { 
          missingCredentials,
          message: "API key, secret key, and passphrase are all required for KuCoin balance fetching",
          errorType: "missing_credentials"
        },
      }
    }

    const timestamp = Date.now().toString()
    const method = "GET"
    const requestPath = "/api/v1/accounts?currency=USDT&type=trade"
    const body = ""
    
    try {
      const signature = createKuCoinSignature(timestamp, method, requestPath, body, secretKey)
      const encodedPassphrase = createKuCoinPassphraseSignature(passphrase, secretKey)
      
      console.log("Fetching KuCoin balance...")
      
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
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        // Parse response body
        let responseText;
        let result;
        
        try {
          responseText = await response.text();
          console.log("KuCoin balance raw response:", responseText);
          
          try {
            result = JSON.parse(responseText);
          } catch (jsonError: any) {
            console.error("KuCoin JSON parsing error:", jsonError);
            return {
              success: false,
              error: `KuCoin Error: Invalid JSON response - ${jsonError.message} - Raw response: ${responseText}`,
              balances: {},
              details: {
                httpStatus: response.status,
                httpStatusText: response.statusText,
                responseText,
                parseError: jsonError.message,
                errorType: "json_parse_error"
              }
            };
          }
        } catch (textError: any) {
          console.error("KuCoin response text extraction error:", textError);
          return {
            success: false,
            error: `KuCoin Error: Failed to extract response text - ${textError.message}`,
            balances: {},
            details: {
              httpStatus: response.status,
              httpStatusText: response.statusText,
              parseError: textError.message,
              errorType: "response_text_error"
            }
          };
        }
        
        console.log("KuCoin balance response:", JSON.stringify(result, null, 2))
        
        // Check for specific error codes and provide detailed messages
        if (!response.ok) {
          return {
            success: false,
            error: `KuCoin Error: HTTP ${response.status} - ${response.statusText} - Raw response: ${responseText}`,
            balances: {},
            details: {
              httpStatus: response.status,
              httpStatusText: response.statusText,
              responseBody: result,
              rawResponse: responseText,
              errorType: "http_error"
            }
          }
        }
        
        if (result.code !== "200000") {
          let detailedError = "Unknown error";
          
          // Map common KuCoin error codes to user-friendly messages
          const errorCodeMap: Record<string, string> = {
            "400100": "Parameter error - check request parameters",
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
            error: `KuCoin Error: ${detailedError} (Code: ${result.code}) - Raw response: ${responseText}`,
            balances: {},
            details: {
              code: result.code,
              message: result.msg || result.message,
              errorType: "api_error",
              responseBody: result,
              rawResponse: responseText
            }
          }
        }
        
        // Extract USDT balance
        let availableUSDT = 0;
        
        if (result.data && Array.isArray(result.data)) {
          for (const account of result.data) {
            if (account.currency === "USDT" && account.type === "trade") {
              availableUSDT = parseFloat(account.available || "0");
              break;
            }
          }
        }
        
        return {
          success: true,
          balances: {
            USDT: availableUSDT
          },
          error: null,
          details: {
            httpStatus: response.status,
            responseCode: result.code,
            message: result.msg || result.message,
            responseBody: result
          },
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        
        // Handle timeout errors specifically
        if (fetchError.name === 'AbortError') {
          return {
            success: false,
            error: "KuCoin Error: Request timed out after 15 seconds",
            balances: {},
            details: { 
              errorType: "timeout",
              errorMessage: fetchError.message,
              errorStack: fetchError.stack
            }
          }
        }
        
        // Handle network errors
        return {
          success: false,
          error: `KuCoin Network Error: ${fetchError.message}`,
          balances: {},
          details: { 
            networkError: fetchError.message,
            errorType: "network_error",
            errorStack: fetchError.stack
          }
        }
      }
    } catch (signatureError: any) {
      console.error("KuCoin signature creation error:", signatureError);
      return {
        success: false,
        error: `KuCoin Error: Failed to create signature - ${signatureError.message}`,
        balances: {},
        details: {
          errorMessage: signatureError.message,
          errorType: "signature_error",
          errorStack: signatureError.stack
        }
      };
    }
  } catch (error: any) {
    console.error("KuCoin balance error:", error)
    return {
      success: false,
      error: `KuCoin Error: ${error.message || "Unknown error"}`,
      balances: {},
      details: { 
        errorMessage: error.message,
        errorType: "unexpected_error",
        errorStack: error.stack
      }
    }
  }
}

export async function GET() {
  try {
    console.log("Fetching balances from exchanges...")
    
    // Get API credentials
    const okxApiKey = process.env.OKX_API_KEY
    const okxSecretKey = process.env.OKX_SECRET_KEY
    const okxPassphrase = process.env.OKX_PASSPHRASE
    const kucoinApiKey = process.env.KUCOIN_API_KEY
    const kucoinSecretKey = process.env.KUCOIN_SECRET_KEY
    const kucoinPassphrase = process.env.KUCOIN_PASSPHRASE
    
    // Log credential availability (not the actual values)
    console.log("API credentials availability:", {
      OKX: {
        apiKey: !!okxApiKey,
        secretKey: !!okxSecretKey,
        passphrase: !!okxPassphrase
      },
      KuCoin: {
        apiKey: !!kucoinApiKey,
        secretKey: !!kucoinSecretKey,
        passphrase: !!kucoinPassphrase
      }
    });
    
    // Fetch balances from both exchanges
    const [okxResult, kucoinResult] = await Promise.all([
      fetchOKXBalance(okxApiKey, okxSecretKey, okxPassphrase),
      fetchKuCoinBalance(kucoinApiKey, kucoinSecretKey, kucoinPassphrase)
    ]);
    
    // Prepare response
    const response = {
      okx: {
        success: okxResult.success,
        balances: okxResult.balances,
        error: okxResult.error
      },
      kucoin: {
        success: kucoinResult.success,
        balances: kucoinResult.balances,
        error: kucoinResult.error
      },
      timestamp: new Date().toISOString()
    };
    
    console.log("Balance response:", JSON.stringify({
      okx: {
        success: response.okx.success,
        balances: response.okx.balances,
        error: response.okx.error ? "Error present" : null
      },
      kucoin: {
        success: response.kucoin.success,
        balances: response.kucoin.balances,
        error: response.kucoin.error ? "Error present" : null
      }
    }, null, 2));
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Balance fetch error:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch balances from exchanges: " + (error.message || "Unknown error"),
        timestamp: new Date().toISOString(),
        okx: { success: false, balances: {}, error: "System error" },
        kucoin: { success: false, balances: {}, error: "System error" }
      },
      { status: 500 },
    )
  }
}
