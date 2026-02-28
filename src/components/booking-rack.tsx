
"use client"

import React, { useState, useEffect } from "react"
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
} from "firebase/firestore"
import { addDays, format, differenceInDays, startOfDay, parse } from "date-fns"
import { es } from "date-fns/locale"
import { Plus, GripVertical } from "lucide-react"

import { db } from "@/firebaseConfig"
import type { Room, Booking } from "@/lib/data"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { NewBookingDialog, type NewBookingData } from "./new-booking-dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card"
import { Skeleton } from "./ui/skeleton"

const getRoomNumber = (name: string) => {
  if (!name) return 0;
  const match = name.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

export function BookingRack() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false)
  const [bookingToEdit, setBookingToEdit] =
    useState<(Booking & { room: Room | null }) | null>(null)
  const [newBookingDefaults, setNewBookingDefaults] = useState<{
    roomId: string
    checkInDate: string
  } | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    setIsLoading(true)
    const roomsCol = collection(db, "rooms")
    const unsubscribeRooms = onSnapshot(
      roomsCol,
      (snapshot) => {
        const roomsFromDb = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .sort(
            (a, b) => getRoomNumber(a.name) - getRoomNumber(b.name)
          ) as Room[]
        setRooms(roomsFromDb)
        if (snapshot.size > 0) setIsLoading(false)
      },
      (error) => {
        console.error("Error fetching rooms for rack:", error)
        setIsLoading(false)
      }
    )

    const bookingsCol = collection(db, "bookings")
    const unsubscribeBookings = onSnapshot(
      bookingsCol,
      (snapshot) => {
        const bookingsFromDb = snapshot.docs.map((doc) => {
          const data = doc.data()
          return { id: doc.id, ...data } as Booking
        })
        setBookings(bookingsFromDb)
      },
      (error) => {
        console.error("Error fetching bookings for rack:", error)
      }
    )

    return () => {
      unsubscribeRooms()
      unsubscribeBookings()
    }
  }, [])

  const today = startOfDay(new Date())
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i))

  const getBookingSegments = (roomId: string) => {
    const roomBookings = bookings
      .filter((b) => b.roomId === roomId && b.status !== "Cancelled")
      .sort(
        (a, b) =>
          new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
      )

    const segments: { booking: Booking; start: number; span: number }[] = []

    roomBookings.forEach((booking) => {
      const checkIn = startOfDay(new Date(booking.check_in + "T00:00:00"))
      const checkOut = startOfDay(new Date(booking.check_out + "T00:00:00"))

      if (checkOut <= today || checkIn > days[days.length - 1]) {
        return
      }

      const startDay = checkIn < today ? today : checkIn
      const endDay =
        checkOut > addDays(days[days.length - 1], 1)
          ? addDays(days[days.length - 1], 1)
          : checkOut

      const startIndex = differenceInDays(startDay, today)
      let duration = differenceInDays(endDay, startDay)

      if (duration > 0 && startIndex < 30) {
        if (startIndex + duration > 30) {
            duration = 30 - startIndex
        }
        segments.push({
          booking: booking,
          start: startIndex,
          span: duration,
        })
      }
    })
    return segments
  }

  const handleOpenNewBookingDialog = (roomId: string, date: Date) => {
    setNewBookingDefaults({
      roomId,
      checkInDate: format(date, "dd/MM/yyyy"),
    })
    setBookingToEdit(null)
    setIsBookingDialogOpen(true)
  }

  const handleBookingClick = (booking: Booking) => {
    const room = rooms.find((r) => r.id === booking.roomId) ?? null
    if (room) {
      setBookingToEdit({ ...booking, room })
      setNewBookingDefaults(null)
      setIsBookingDialogOpen(true)
    }
  }

  const handleSaveBooking = async (bookingData: NewBookingData) => {
    const isEditing = !!bookingToEdit

    try {
      const selectedRoom = rooms.find((r) => r.id === bookingData.roomId)

      if (!selectedRoom?.name || !selectedRoom?.room_id_cloudbeds) {
        toast({
          variant: "destructive",
          title: "Error de Habitación",
          description: "La habitación seleccionada no es válida o no está sincronizada con Cloudbeds.",
        })
        return
      }


      const checkIn = parse(bookingData.checkInDate, "dd/MM/yyyy", new Date())
      const checkOut = parse(bookingData.checkOutDate, "dd/MM/yyyy", new Date())

      const bookingToSave = {
        guest_name: bookingData.guest_name,
        booking_id_cloudbeds: bookingData.status === 'Bloqueada' ? `block-${new Date().getTime()}` : bookingData.booking_id,
        room_id_cloudbeds: selectedRoom.room_id_cloudbeds,
        room_name: selectedRoom.name,
        check_in: format(checkIn, "yyyy-MM-dd"),
        check_out: format(checkOut, "yyyy-MM-dd"),
        status: bookingData.status,
        access_enabled: bookingData.status === "Checked-In",
      }

      if (isEditing && bookingToEdit) {
        const bookingRef = doc(db, "bookings", bookingToEdit.id)
        await updateDoc(bookingRef, bookingToSave)
      } else {
        await addDoc(collection(db, "bookings"), bookingToSave)
        toast({
          title: "Reserva Creada",
          description: "La nueva reserva ha sido guardada exitosamente.",
        })
      }
      setIsBookingDialogOpen(false)
      setBookingToEdit(null)
    } catch (error) {
      console.error("Error saving booking:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar la reserva.",
      })
    }
  }

  const bookingStatusColors: Record<string, string> = {
    Confirmed: "bg-blue-500 border-blue-700 text-white",
    "Checked-In": "bg-green-500 border-green-700 text-white",
    checked_in: "bg-green-500 border-green-700 text-white",
    "Checked-Out": "bg-gray-400 border-gray-600 text-white",
    Bloqueada: "bg-red-500 border-red-700 text-white",
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Rack de Reservas</CardTitle>
          <CardDescription>
            Visualización de la ocupación de los próximos 30 días.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-x-auto border rounded-lg">
           {isLoading ? (
             <div className="p-4">
                <Skeleton className="h-10 w-full mb-1" />
                <Skeleton className="h-64 w-full" />
             </div>
           ) : (
            <div
              className="grid bg-border -m-px"
              style={{
                gridTemplateColumns: `minmax(150px, 1fr) repeat(${days.length}, minmax(50px, 1fr))`,
              }}
            >
              {/* Header */}
              <div className="sticky left-0 z-30 flex items-center justify-start p-2 font-semibold bg-card border-b border-r">
                Habitación
              </div>
              {days.map((day) => (
                <div
                  key={day.toString()}
                  className="flex flex-col items-center justify-center p-1 text-center bg-card border-b border-r"
                >
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    {format(day, "eee", { locale: es })}
                  </div>
                  <div className={cn(
                      "text-lg font-bold",
                      format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd') && "text-primary"
                    )}>
                    {format(day, "d")}
                  </div>
                </div>
              ))}

              {/* Body Rows */}
              {rooms.map((room, roomIndex) => (
                <React.Fragment key={room.id}>
                  {/* Room Label */}
                  <div className="sticky left-0 z-20 flex flex-col items-start justify-center p-2 bg-card border-b border-r">
                    <div className="font-semibold">{room.name}</div>
                    <div className="text-xs text-muted-foreground">{room.type_name}</div>
                  </div>

                  {/* Day Cells for the room */}
                  {days.map((day, dayIndex) => (
                    <div
                      key={`${room.id}-${day.toString()}`}
                      style={{
                        gridRow: roomIndex + 2,
                        gridColumn: dayIndex + 2,
                      }}
                      className="relative min-h-[60px] bg-background border-b border-r group"
                    >
                       <Button
                        variant="ghost"
                        size="icon"
                        className="h-full w-full opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleOpenNewBookingDialog(room.id, day)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </React.Fragment>
              ))}

              {/* Booking Segments */}
              {rooms.flatMap((room, roomIndex) => 
                getBookingSegments(room.id).map(
                    ({ booking, start, span }) => (
                      <div
                        key={booking.id}
                        className={cn(
                          "z-10 m-1 flex cursor-pointer items-center overflow-hidden rounded-md border p-2 text-xs font-semibold shadow-sm transition-all hover:brightness-110",
                          bookingStatusColors[booking.status] || "bg-gray-500"
                        )}
                        style={{
                          gridRow: roomIndex + 2,
                          gridColumn: `${start + 2} / span ${span}`,
                        }}
                        onClick={() => handleBookingClick(booking)}
                      >
                        <GripVertical className="h-4 w-4 mr-1 text-white/50" />
                        <span className="truncate">{booking.guest_name}</span>
                      </div>
                    )
                  )
              )}

            </div>
           )}
          </div>
        </CardContent>
      </Card>
      
      <NewBookingDialog
        isOpen={isBookingDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBookingToEdit(null)
            setNewBookingDefaults(null)
          }
          setIsBookingDialogOpen(open)
        }}
        onSave={handleSaveBooking}
        rooms={rooms}
        bookingToEdit={bookingToEdit}
        defaultValues={newBookingDefaults ?? undefined}
      />
    </>
  )
}
