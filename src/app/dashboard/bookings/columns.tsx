
"use client"

import { type ColumnDef } from "@tanstack/react-table"
import {
  MoreHorizontal,
  QrCode,
  Check,
  DoorOpen,
  Trash2,
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
  room: Room | null;
}

type GetColumnsProps = {
  onAccessToggle: (booking: BookingWithDetails, enabled: boolean) => void
  onCheckIn: (booking: BookingWithDetails) => void
  onShowQr: (booking: BookingWithDetails) => void
  onEdit: (booking: BookingWithDetails) => void
  onDelete: (booking: BookingWithDetails) => void
}

const normalizeStatus = (status: Booking['status']) => {
  if (status === 'checked_in') return 'Checked-In';
  return status;
}

export const getColumns = ({
  onAccessToggle,
  onCheckIn,
  onShowQr,
  onEdit,
  onDelete,
}: GetColumnsProps): ColumnDef<BookingWithDetails>[] => [
  {
    accessorKey: "guest_name",
    header: "Huésped",
    cell: ({ row }) => {
      const guestName = row.original.guest_name
      return (
        <div className="font-medium">
          {guestName || (
            <span className="text-muted-foreground">No disponible</span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: "booking_id_cloudbeds",
    header: "N° de Reserva",
    cell: ({ row }) => {
      const bookingId = row.original.booking_id_cloudbeds
      return (
        <div className="font-mono text-xs">
          {bookingId || (
            <span className="text-muted-foreground">N/A</span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: "room",
    header: "Habitación",
    cell: ({ row }) => {
      const booking = row.original;
      const roomName = booking.room?.name ?? booking.room_name;
      const roomTypeName = booking.room?.type_name;
      return (
        <div>
          <div className="font-semibold">{roomName}</div>
          {roomTypeName && <div className="text-xs text-muted-foreground">{roomTypeName}</div>}
        </div>
      )
    },
  },
  {
    accessorKey: "check_in",
    header: "Fechas",
    cell: ({ row }) => {
      return (
        <div>
          <div>{row.original.check_in}</div>
          <div>{row.original.check_out}</div>
        </div>
      )
    },
  },
  {
    accessorKey: "status",
    header: "Estado",
    cell: ({ row }) => {
      const status = normalizeStatus(row.original.status);
      const variant: "default" | "secondary" | "destructive" | "outline" =
        status === "Checked-In"
          ? "default"
          : status === "Checked-Out"
          ? "outline"
          : status === "Cancelled"
          ? "destructive"
          : status === "Bloqueada"
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
      const normalizedStatus = normalizeStatus(booking.status);

      return (
        <div className="flex items-center space-x-2">
          <Switch
            id={`access-switch-${booking.id}`}
            checked={booking.access_enabled}
            onCheckedChange={handleAccessChange}
            disabled={!["Confirmed", "Checked-In"].includes(normalizedStatus)}
          />
        </div>
      )
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const booking = row.original
      const normalizedStatus = normalizeStatus(booking.status);

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
            {normalizedStatus === "Confirmed" && (
              <DropdownMenuItem onClick={() => onCheckIn(booking)}>
                <Check className="mr-2 h-4 w-4" />
                Registrar Entrada
              </DropdownMenuItem>
            )}
            {normalizedStatus === "Checked-In" && (
              <>
                <DropdownMenuItem onClick={() => onShowQr(booking)}>
                  <QrCode className="mr-2 h-4 w-4" />
                  Generar Código QR
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
              Eliminar Reserva
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
