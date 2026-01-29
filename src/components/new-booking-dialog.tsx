
"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { format, parse } from "date-fns"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import type { Room, Booking } from "@/lib/data"
import { Input } from "./ui/input"

const bookingFormSchema = z
  .object({
    guest_name: z.string().min(3, { message: "El nombre es requerido." }),
    booking_id: z
      .string()
      .min(1, { message: "El ID de Cloudbeds es requerido." }),
    roomId: z.string().min(1, { message: "La habitación es requerida." }),
    checkInDate: z
      .string()
      .regex(
        /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/,
        "El formato de fecha debe ser dd/mm/aaaa."
      ),
    checkOutDate: z
      .string()
      .regex(
        /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/,
        "El formato de fecha debe ser dd/mm/aaaa."
      ),
    status: z.enum(["Confirmed", "Checked-In", "Checked-Out", "Cancelled"]),
  })
  .refine(
    (data) => {
      try {
        const checkIn = parse(data.checkInDate, "dd/MM/yyyy", new Date())
        const checkOut = parse(data.checkOutDate, "dd/MM/yyyy", new Date())
        return checkOut > checkIn
      } catch {
        return false
      }
    },
    {
      message: "La fecha de check-out debe ser posterior a la de check-in.",
      path: ["checkOutDate"],
    }
  )

export type NewBookingData = z.infer<typeof bookingFormSchema>

type NewBookingDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: NewBookingData) => void
  rooms: Room[]
  bookingToEdit?: Booking | null
}

export function NewBookingDialog({
  isOpen,
  onOpenChange,
  onSave,
  rooms,
  bookingToEdit,
}: NewBookingDialogProps) {
  const form = useForm<NewBookingData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      guest_name: "",
      booking_id: "",
      roomId: "",
      checkInDate: "",
      checkOutDate: "",
      status: "Confirmed",
    },
  })

  const isEditing = !!bookingToEdit

  useEffect(() => {
    if (isOpen) {
      if (isEditing && bookingToEdit) {
        form.reset({
          guest_name: bookingToEdit.guest_name,
          booking_id: bookingToEdit.booking_id,
          roomId: bookingToEdit.roomId,
          checkInDate: format(
            parse(bookingToEdit.checkInDate, "yyyy-MM-dd", new Date()),
            "dd/MM/yyyy"
          ),
          checkOutDate: format(
            parse(bookingToEdit.checkOutDate, "yyyy-MM-dd", new Date()),
            "dd/MM/yyyy"
          ),
          status: bookingToEdit.status,
        })
      } else {
        form.reset({
          guest_name: "",
          booking_id: "",
          roomId: "",
          checkInDate: "",
          checkOutDate: "",
          status: "Confirmed",
        })
      }
    }
  }, [isOpen, bookingToEdit, isEditing, form])

  const onSubmit = (data: NewBookingData) => {
    onSave(data)
  }

  const availableRooms = rooms.filter(
    (room) =>
      room.status === "Disponible" ||
      (isEditing && room.id === bookingToEdit?.roomId)
  )

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-headline">
            {isEditing ? "Modificar Reserva" : "Nueva Reserva"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Edite los detalles de la reserva."
              : "Complete los detalles para crear una nueva reserva."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 py-4"
          >
            <FormField
              control={form.control}
              name="guest_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Huésped</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Juan Pérez" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="booking_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Reserva (Cloudbeds)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="ID de la reserva en Cloudbeds"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="roomId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Habitación</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione una habitación disponible" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableRooms.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          Habitación {room.room_number} ({room.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="checkInDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check-in</FormLabel>
                    <FormControl>
                      <Input placeholder="dd/mm/aaaa" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="checkOutDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check-out</FormLabel>
                    <FormControl>
                      <Input placeholder="dd/mm/aaaa" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione un estado" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Confirmed">Confirmado</SelectItem>
                      <SelectItem value="Checked-In">Checked-In</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">
                {isEditing ? "Guardar Cambios" : "Guardar Reserva"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
