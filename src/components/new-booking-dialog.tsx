"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import type { Room } from "@/lib/data"
import { Input } from "./ui/input"

const bookingSchema = z
  .object({
    guestName: z
      .string()
      .min(1, { message: "El nombre del huésped es requerido." }),
    roomId: z.string({ required_error: "Debe seleccionar una habitación." }),
    checkInDate: z.date({
      required_error: "La fecha de check-in es requerida.",
    }),
    checkOutDate: z.date({
      required_error: "La fecha de check-out es requerida.",
    }),
    status: z.enum(["Confirmed", "Checked-In", "Checked-Out", "Cancelled"]),
  })
  .refine((data) => data.checkOutDate > data.checkInDate, {
    message: "La fecha de check-out debe ser posterior a la de check-in.",
    path: ["checkOutDate"],
  })

export type NewBookingData = z.infer<typeof bookingSchema>

type NewBookingDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: NewBookingData) => void
  rooms: Room[]
}

export function NewBookingDialog({
  isOpen,
  onOpenChange,
  onSave,
  rooms,
}: NewBookingDialogProps) {
  const [checkInPickerOpen, setCheckInPickerOpen] = useState(false)
  const [checkOutPickerOpen, setCheckOutPickerOpen] = useState(false)

  const form = useForm<NewBookingData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      status: "Confirmed",
      guestName: "",
    },
  })

  useEffect(() => {
    if (!isOpen) {
      form.reset({
        status: "Confirmed",
        guestName: "",
        roomId: undefined,
        checkInDate: undefined,
        checkOutDate: undefined,
      })
    }
  }, [isOpen, form])

  const onSubmit = (data: NewBookingData) => {
    onSave(data)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-headline">Nueva Reserva</DialogTitle>
          <DialogDescription>
            Complete los detalles para crear una nueva reserva.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
            <FormField
              control={form.control}
              name="guestName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Huésped</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del huésped" {...field} />
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
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione una habitación disponible" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {rooms
                        .filter((room) => room.status === "Disponible")
                        .map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            Habitación {room.roomNumber} ({room.type})
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
                  <FormItem className="flex flex-col">
                    <FormLabel>Check-in</FormLabel>
                    <Popover modal={true} open={checkInPickerOpen} onOpenChange={setCheckInPickerOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: es })
                            ) : (
                              <span>Elige una fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="w-auto p-0" 
                        align="start"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date)
                            setCheckInPickerOpen(false)
                          }}
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0, 0, 0, 0))
                          }
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="checkOutDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Check-out</FormLabel>
                    <Popover modal={true} open={checkOutPickerOpen} onOpenChange={setCheckOutPickerOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: es })
                            ) : (
                              <span>Elige una fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent 
                        className="w-auto p-0" 
                        align="start"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date)
                            setCheckOutPickerOpen(false)
                          }}
                          disabled={(date) =>
                            !form.getValues("checkInDate") ||
                            date <= form.getValues("checkInDate")
                          }
                        />
                      </PopoverContent>
                    </Popover>
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
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
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
              <Button type="submit">Guardar Reserva</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
