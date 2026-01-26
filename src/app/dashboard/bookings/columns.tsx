"use client"

import { useState } from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, QrCode, Check, DoorOpen, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { QrCodeDialog } from "@/components/qr-code-dialog"
import type { Booking, Guest, Room } from "@/lib/data"
import { useToast } from "@/hooks/use-toast"

export type BookingWithDetails = Booking & {
  guest: Guest
  room: Room
}

export const columns: ColumnDef<BookingWithDetails>[] = [
  {
    accessorKey: "guest",
    header: "Guest",
    cell: ({ row }) => {
      const guest = row.original.guest
      return (
        <div className="font-medium">
          <div>{guest.name}</div>
          <div className="text-xs text-muted-foreground">{guest.email}</div>
        </div>
      )
    },
  },
  {
    accessorKey: "room",
    header: "Room",
    cell: ({ row }) => {
      const room = row.original.room
      return (
        <div>
          <div className="font-semibold">{room.roomNumber}</div>
          <div className="text-xs text-muted-foreground">{room.type}</div>
        </div>
      )
    },
  },
  {
    accessorKey: "checkInDate",
    header: "Dates",
    cell: ({ row }) => {
      return (
        <div>
          <div>{row.original.checkInDate}</div>
          <div>{row.original.checkOutDate}</div>
        </div>
      )
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status
      const variant: "default" | "secondary" | "destructive" | "outline" =
        status === "Checked-In"
          ? "default"
          : status === "Checked-Out"
          ? "outline"
          : status === "Cancelled"
          ? "destructive"
          : "secondary"
      return <Badge variant={variant}>{status}</Badge>
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const booking = row.original
      const { toast } = useToast()
      const [isQrDialogOpen, setQrDialogOpen] = useState(false)
      
      const handleCheckIn = () => {
        // In a real app, you would call a server action here.
        console.log("Checking in booking:", booking.id);
        toast({
          title: "Check-in Successful",
          description: `${booking.guest.name} has been checked in to Room ${booking.room.roomNumber}.`,
        });
      };

      return (
        <>
          <QrCodeDialog 
            isOpen={isQrDialogOpen}
            onOpenChange={setQrDialogOpen}
            booking={booking}
            guest={booking.guest}
            room={booking.room}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              {booking.status === "Confirmed" && (
                <DropdownMenuItem onClick={handleCheckIn}>
                  <Check className="mr-2 h-4 w-4" />
                  Check-in
                </DropdownMenuItem>
              )}
              {booking.status === "Checked-In" && (
                <>
                  <DropdownMenuItem onClick={() => setQrDialogOpen(true)}>
                    <QrCode className="mr-2 h-4 w-4" />
                    Generate QR Code
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <DoorOpen className="mr-2 h-4 w-4" />
                    Check-out
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Cancel Booking
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )
    },
  },
]
