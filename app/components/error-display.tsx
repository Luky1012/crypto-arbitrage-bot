"use client"

import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface ErrorDisplayProps {
  message: string
  onRetry?: () => void
}

export function ErrorDisplay({ message, onRetry }: ErrorDisplayProps) {
  return (
    <Card className="border-red-200 bg-red-50">
      <CardContent className="pt-6 pb-4">
        <div className="flex flex-col space-y-2">
          <div className="flex items-center space-x-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span className="font-medium">{message}</span>
          </div>
          {onRetry && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={onRetry} className="text-xs flex items-center space-x-1">
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
