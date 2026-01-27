
"use client"

import { type ColumnDef } from "@tanstack/react-table"
import {
  MoreHorizontal,
  QrCode,
  Check,
  DoorOpen,
  Trash2,
  KeyRound,
  Pencil,
} from "lucide-react"

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
import type { Booking, Room } from "@/lib/data"
import { Switch } from "@/components/ui/switch"

export type BookingWithDetails = Booking & {
  room: Room
}

type GetColumnsProps = {
  onAccessToggle: (booking: BookingWithDetails, enabled: boolean) => void
  onCheckIn: (booking: BookingWithDetails) => void
  onRemoteOpen: (booking: BookingWithDetails) => void
  onShowQr: (booking: BookingWithDetails) => void
  onEdit: (booking: BookingWithDetails) => void
  onDelete: (booking: BookingWithDetails) => void
}

export const getColumns = ({
  onAccessToggle,
  onCheckIn,
  onRemoteOpen,
  onShowQr,
  onEdit,
  onDelete,
}: GetColumnsProps): ColumnDef<BookingWithDetails>[] => [
  {
    accessorKey: "guestName",
    header: "Huésped",
    cell: ({ row }) => {
      return <div className="font-medium">{row.original.guestName}</div>
    },
  },
  {
    accessorKey: "booking_id",
    header: "ID Cloudbeds",
    cell: ({ row }) => {
      return <div className="font-medium">{row.original.booking_id}</div>
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
    accessorKey: "access_enabled",
    header: "Acceso",
    cell: ({ row }) => {
      const booking = row.original
      const handleAccessChange = (enabled: boolean) => {
        onAccessToggle(booking, enabled)
      }

      return (
        <div className="flex items-center space-x-2">
          <Switch
            id={`access-switch-${booking.id}`}
            checked={booking.access_enabled}
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

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Abrir menú</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Acciones</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onEdit(booking)}>
              <Pencil className="mr-2 h-4 w-4" />
              Modificar
            </DropdownMenuItem>
            {booking.status === "Confirmed" && (
              <DropdownMenuItem onClick={() => onCheckIn(booking)}>
                <Check className="mr-2 h-4 w-4" />
                Registrar Entrada
              </DropdownMenuItem>
            )}
            {booking.status === "Checked-In" && (
              <>
                <DropdownMenuItem onClick={() => onShowQr(booking)}>
                  <QrCode className="mr-2 h-4 w-4" />
                  Generar Código QR
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onRemoteOpen(booking)}>
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
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onClick={() => onDelete(booking)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Cancelar Reserva
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
