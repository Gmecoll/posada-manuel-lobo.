"use client"

import { useState } from "react"
import { CheckCircle2, QrCode } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { cn } from "@/lib/utils"

export default function RoomAccessPage({ params }: { params: { id: string } }) {
  const [isUnlocked, setIsUnlocked] = useState(false)

  const handleUnlock = () => {
    setIsUnlocked(true)
    setTimeout(() => setIsUnlocked(false), 4000) // Reset after 4 seconds
  }

  // In a real app, you would fetch room details based on params.id
  const roomNumber = "101"

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4">
      <div className="absolute top-6 left-6">
        <Logo />
      </div>
      <div className="w-full max-w-md text-center">
        <h1 className="font-headline text-3xl md:text-4xl">
          Room <span className="text-primary">{roomNumber}</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          {isUnlocked
            ? "Welcome! The door is now unlocked."
            : "Tap to scan your QR code and unlock the door."}
        </p>

        <div className="relative mt-12 flex h-80 w-full items-center justify-center">
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center space-y-4 rounded-lg border-2 border-dashed bg-card transition-all duration-500",
              isUnlocked ? "border-green-500 bg-green-50" : "border-primary/50",
              isUnlocked ? "opacity-100 scale-100" : "opacity-0 scale-90"
            )}
          >
            <CheckCircle2 className="h-24 w-24 text-green-600" />
            <span className="text-2xl font-semibold text-green-700">
              Access Granted
            </span>
          </div>

          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-all duration-500",
              isUnlocked ? "opacity-0 scale-110" : "opacity-100 scale-100"
            )}
          >
            <Button
              variant="default"
              className="h-48 w-48 rounded-full shadow-lg"
              onClick={handleUnlock}
              aria-label="Scan QR Code to Unlock"
            >
              <div className="flex flex-col items-center gap-2">
                <QrCode className="h-16 w-16" />
                <span className="text-lg font-semibold">Scan to Unlock</span>
              </div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
