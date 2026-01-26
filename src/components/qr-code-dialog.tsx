"use client"

import { QrCode } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import type { Booking, Guest, Room } from "@/lib/data"

type QrCodeDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  booking: Booking | null
  guest: Guest | null
  room: Room | null
}

export function QrCodeDialog({
  isOpen,
  onOpenChange,
  booking,
  guest,
  room,
}: QrCodeDialogProps) {
  if (!booking || !guest || !room) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">Room Access QR Code</DialogTitle>
          <DialogDescription>
            Scan this code to unlock the door for Room {room.roomNumber}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-4 py-8">
          <div className="rounded-lg border bg-card p-4 shadow-inner">
            <QrCode className="h-48 w-48 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold">{guest.name}</p>
            <p className="text-sm text-muted-foreground">Room {room.roomNumber}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
