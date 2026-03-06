
"use client"

import { type ColumnDef } from "@tanstack/react-table"
import {
  MoreHorizontal,
  QrCode,
  Check,
  DoorOpen,
  Trash2,
  Pencil,
  ArrowUpDown,
  Users,
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
  room: Room | null
}

type GetColumnsProps = {
  onAccessToggle: (booking: BookingWithDetails, enabled: boolean) => void
  onCheckIn: (booking: BookingWithDetails) => void
  onShowQr: (booking: BookingWithDetails) => void
  onEdit: (booking: BookingWithDetails) => void
  onDelete: (booking: BookingWithDetails) => void
}

const normalizeStatus = (status: Booking["status"]) => {
  if (status === "checked_in") return "Checked-In"
  return status
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
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Huésped
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
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
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          N° de Reserva
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const bookingId = row.original.booking_id_cloudbeds
      return (
        <div className="font-mono text-xs">
          {bookingId || <span className="text-muted-foreground">N/A</span>}
        </div>
      )
    },
  },
  {
    accessorKey: "room",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Habitación
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const booking = row.original
      const roomName = (booking.rooms && booking.rooms.length > 0)
        ? booking.rooms.map(r => r.room_name).join(" | ")
        : (booking.room?.name ?? booking.room_name)
        
      const roomTypeName = booking.room?.type_name
      return (
        <div>
          <div className="font-semibold">{roomName}</div>
          {roomTypeName && (!booking.rooms || booking.rooms.length <= 1) && (
            <div className="text-xs text-muted-foreground">
              {roomTypeName}
            </div>
          )}
        </div>
      )
    },
    sortingFn: (rowA, rowB) => {
      const roomNameA = (rowA.original.rooms && rowA.original.rooms.length > 0)
        ? rowA.original.rooms.map(r => r.room_name).join(" | ")
        : (rowA.original.room?.name ?? rowA.original.room_name ?? "")
      const roomNameB = (rowB.original.rooms && rowB.original.rooms.length > 0)
        ? rowB.original.rooms.map(r => r.room_name).join(" | ")
        : (rowB.original.room?.name ?? rowB.original.room_name ?? "")
      return roomNameA.localeCompare(roomNameB)
    },
  },
  {
    accessorKey: "guest_count",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Huéspedes
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const count = row.original.guest_count || 1;
      return (
        <div className="flex items-center justify-start gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{count}</span>
        </div>
      )
    },
},
  {
    accessorKey: "check_in",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Fechas
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
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
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Estado
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const status = normalizeStatus(row.original.status)
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

      return (
        <div className="flex items-center space-x-2">
          <Switch
            id={`access-switch-${booking.id}`}
            checked={booking.access_enabled}
            onCheckedChange={handleAccessChange}
          />
        </div>
      )
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const booking = row.original
      const normalizedStatus = normalizeStatus(booking.status)

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
