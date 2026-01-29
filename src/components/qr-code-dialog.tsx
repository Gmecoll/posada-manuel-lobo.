
"use client"

import * as React from "react"
import QRCode from "react-qr-code"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import type { Booking, Room } from "@/lib/data"
import { Skeleton } from "./ui/skeleton"

type QrCodeDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  booking: Booking | null
  room: Room | null
}

export function QrCodeDialog({
  isOpen,
  onOpenChange,
  booking,
  room,
}: QrCodeDialogProps) {
  const [accessUrl, setAccessUrl] = React.useState("")

  React.useEffect(() => {
    if (booking && typeof window !== "undefined") {
      setAccessUrl(`${window.location.origin}/access/${booking.id}`)
    }
  }, [booking])

  if (!booking || !room) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">Código QR de Acceso</DialogTitle>
          <DialogDescription>
            Escanea este código para desbloquear la puerta de la Habitación{" "}
            {room.room_number}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-4 py-8">
          <div className="rounded-lg border bg-white p-4 shadow-inner">
            {accessUrl ? (
              <QRCode value={accessUrl} size={192} fgColor="hsl(180 25% 25%)" />
            ) : (
              <Skeleton className="h-48 w-48" />
            )}
          </div>
          <div className="text-center">
            <p className="font-semibold">ID Reserva: {booking.booking_id}</p>
            <p className="text-sm text-muted-foreground">
              Habitación {room.room_number}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
