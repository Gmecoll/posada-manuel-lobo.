
"use client"

import { useState } from "react"
import { type ColumnDef } from "@tanstack/react-table"
import {
  MoreHorizontal,
  QrCode,
  Check,
  DoorOpen,
  Trash2,
  KeyRound,
} from "lucide-react"
import { doc, updateDoc } from "firebase/firestore"

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
import type { Booking, Room } from "@/lib/data"
import { useToast } from "@/hooks/use-toast"
import { Switch } from "@/components/ui/switch"
import { db } from "@/firebaseConfig"

export type BookingWithDetails = Booking & {
  room: Room
}

export const columns: ColumnDef<BookingWithDetails>[] = [
  {
    accessorKey: "guestName",
    header: "Huésped",
    cell: ({ row }) => {
      return <div className="font-medium">{row.original.guestName}</div>
    },
  },
  {
    accessorKey: "cloudbedsId",
    header: "ID Cloudbeds",
    cell: ({ row }) => {
      return <div className="font-medium">{row.original.cloudbedsId}</div>
    },
  },
  {
    accessorKey: "room",
    header: "Habitación",
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
    header: "Fechas",
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
    header: "Estado",
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
    accessorKey: "accessEnabled",
    header: "Acceso",
    cell: ({ row }) => {
      const booking = row.original
      const { toast } = useToast()

      const handleAccessChange = async (enabled: boolean) => {
        const bookingRef = doc(db, "bookings", booking.id)
        try {
          await updateDoc(bookingRef, { accessEnabled: enabled })
          toast({
            title: "Acceso actualizado",
            description: `El acceso para la reserva ${
              booking.cloudbedsId
            } ha sido ${enabled ? "habilitado" : "deshabilitado"}.`,
          })
        } catch (error) {
          console.error("Error updating access status:", error)
          toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo actualizar el estado de acceso.",
          })
        }
      }

      return (
        <div className="flex items-center space-x-2">
          <Switch
            id={`access-switch-${booking.id}`}
            checked={booking.accessEnabled}
            onCheckedChange={handleAccessChange}
            disabled={!["Confirmed", "Checked-In"].includes(booking.status)}
          />
        </div>
      )
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const booking = row.original
      const { toast } = useToast()
      const [isQrDialogOpen, setQrDialogOpen] = useState(false)

      const handleCheckIn = async () => {
        const bookingRef = doc(db, "bookings", booking.id)
        const roomRef = doc(db, "rooms", booking.roomId)
        try {
          await updateDoc(bookingRef, { status: "Checked-In", accessEnabled: true })
          await updateDoc(roomRef, { status: "Ocupada" })
          toast({
            title: "Check-in Exitoso",
            description: `Check-in para reserva ${booking.cloudbedsId} en Habitación ${booking.room.roomNumber}.`,
          })
        } catch (error) {
          console.error("Error during check-in:", error)
          toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo realizar el check-in.",
          })
        }
      }

      const handleRemoteOpen = async () => {
        const roomRef = doc(db, "rooms", booking.roomId)
        try {
          await updateDoc(roomRef, { remoteUnlock: Date.now() })
          toast({
            title: "Apertura Remota Activada",
            description: `La puerta de la Habitación ${booking.room.roomNumber} se desbloqueará momentáneamente.`,
          })
        } catch (error) {
          console.error("Error triggering remote open:", error)
          toast({
            variant: "destructive",
            title: "Error",
            description: "No se pudo activar la apertura remota.",
          })
        }
      }

      return (
        <>
          <QrCodeDialog
            isOpen={isQrDialogOpen}
            onOpenChange={setQrDialogOpen}
            booking={booking}
            room={booking.room}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Abrir menú</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              {booking.status === "Confirmed" && (
                <DropdownMenuItem onClick={handleCheckIn}>
                  <Check className="mr-2 h-4 w-4" />
                  Registrar Entrada
                </DropdownMenuItem>
              )}
              {booking.status === "Checked-In" && (
                <>
                  <DropdownMenuItem onClick={() => setQrDialogOpen(true)}>
                    <QrCode className="mr-2 h-4 w-4" />
                    Generar Código QR
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleRemoteOpen}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Apertura Remota
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <DoorOpen className="mr-2 h-4 w-4" />
                    Registrar Salida
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Cancelar Reserva
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )
    },
  },
]
