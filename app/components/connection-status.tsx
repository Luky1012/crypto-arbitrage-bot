"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, XCircle, AlertCircle } from "lucide-react"

interface ConnectionStatusProps {
  okxAvailable?: boolean
  kucoinAvailable?: boolean
  okxCoinsCount?: number
  kucoinCoinsCount?: number
  lastUpdate?: string
}

export function ConnectionStatus({
  okxAvailable,
  kucoinAvailable,
  okxCoinsCount = 0,
  kucoinCoinsCount = 0,
  lastUpdate,
}: ConnectionStatusProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Exchange Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm">OKX</span>
          <div className="flex items-center space-x-2">
            {okxAvailable ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <Badge variant={okxAvailable ? "default" : "destructive"}>
              {okxAvailable ? `${okxCoinsCount} coins` : "Offline"}
            </Badge>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm">KuCoin</span>
          <div className="flex items-center space-x-2">
            {kucoinAvailable ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <Badge variant={kucoinAvailable ? "default" : "destructive"}>
              {kucoinAvailable ? `${kucoinCoinsCount} coins` : "Offline"}
            </Badge>
          </div>
        </div>

        {lastUpdate && (
          <div className="flex items-center space-x-2 pt-2 border-t">
            <AlertCircle className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Last update: {new Date(lastUpdate).toLocaleTimeString()}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
