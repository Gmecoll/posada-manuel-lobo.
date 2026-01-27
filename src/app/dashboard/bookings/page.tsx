"use client"

import { useState, useEffect } from "react"
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
} from "firebase/firestore"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PlusCircle } from "lucide-react"

import type { Room, Guest } from "@/lib/data"
import type { Booking } from "@/lib/data"
import type { BookingWithDetails } from "./columns"
import { columns } from "./columns"
import { DataTable } from "./data-table"
import { db } from "@/firebaseConfig"
import {
  NewBookingDialog,
  type NewBookingData,
} from "@/components/new-booking-dialog"
import { useToast } from "@/hooks/use-toast"
import { format } from "date-fns"

export default function BookingsPage() {
  const [data, setData] = useState<BookingWithDetails[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [isNewBookingDialogOpen, setIsNewBookingDialogOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const roomsCol = collection(db, "rooms")
    const unsubscribe = onSnapshot(roomsCol, (snapshot) => {
      const roomsFromDb = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Room[]
      setRooms(roomsFromDb)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (rooms.length === 0) return

    const bookingsCol = collection(db, "bookings")
    const unsubscribe = onSnapshot(bookingsCol, (snapshot) => {
      const bookingsFromDb = snapshot.docs.map((doc) => {
        const docData = doc.data()
        return {
          id: doc.id,
          guestName: docData.guestName,
          roomId: docData.roomId,
          checkInDate: docData.checkInDate,
          checkOutDate: docData.checkOutDate,
          status: docData.status,
          accessEnabled: docData.accessEnabled,
        } as Booking
      })

      const detailedBookings = bookingsFromDb
        .map((booking) => {
          const room = rooms.find((r) => r.id === booking.roomId)
          if (!room) {
            return null
          }
          const guest: Guest = {
            id: `guest-${booking.id}`,
            name: booking.guestName,
            email: "", // email is not available anymore
          }
          return {
            ...booking,
            guest,
            room,
          }
        })
        .filter((b): b is BookingWithDetails => b !== null)
        .sort(
          (a, b) =>
            new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime()
        )

      setData(detailedBookings)
    })

    return () => unsubscribe()
  }, [rooms])

  const handleSaveBooking = async (bookingData: NewBookingData) => {
    try {
      const roomNumberInput = bookingData.roomNumber.trim()
      const availableRooms = rooms.filter((r) => r.status === "Disponible")

      const matchedRoom = availableRooms.find((room) => {
        const digits = room.roomNumber.match(/\d+/)
        return digits ? digits[0] === roomNumberInput : false
      })

      if (!matchedRoom) {
        toast({
          variant: "destructive",
          title: "Habitación no encontrada",
          description: `No se encontró una habitación disponible con el número ${roomNumberInput}.`,
        })
        return
      }

      const bookingsCol = collection(db, "bookings")

      const bookingToSave = {
        guestName: bookingData.guestName,
        roomId: matchedRoom.id,
        checkInDate: format(bookingData.checkInDate, "yyyy-MM-dd"),
        checkOutDate: format(bookingData.checkOutDate, "yyyy-MM-dd"),
        status: bookingData.status,
        accessEnabled: bookingData.status === "Checked-In",
      }

      await addDoc(bookingsCol, bookingToSave)

      // If guest is checking in immediately, mark room as occupied
      if (bookingData.status === "Checked-In") {
        const roomRef = doc(db, "rooms", matchedRoom.id)
        await updateDoc(roomRef, { status: "Ocupada" })
      }

      toast({
        title: "Reserva Creada",
        description: "La nueva reserva ha sido guardada exitosamente.",
      })
      setIsNewBookingDialogOpen(false)
    } catch (error) {
      console.error("Error creating booking:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo crear la reserva.",
      })
    }
  }

  return (
    <>
      <NewBookingDialog
        isOpen={isNewBookingDialogOpen}
        onOpenChange={setIsNewBookingDialogOpen}
        onSave={handleSaveBooking}
        rooms={rooms}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-headline">Reservas</CardTitle>
            <CardDescription>
              Gestiona las reservas de los huéspedes y la asignación de
              habitaciones.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setIsNewBookingDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Nueva Reserva
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={data} />
        </CardContent>
      </Card>
    </>
  )
}
