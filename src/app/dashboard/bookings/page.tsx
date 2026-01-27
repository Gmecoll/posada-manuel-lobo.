"use client"

import { useState, useEffect } from "react"
import { collection, onSnapshot } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PlusCircle } from "lucide-react"

import { guests, type Room, type Booking } from "@/lib/data"
import type { BookingWithDetails } from "./columns"
import { columns } from "./columns"
import { DataTable } from "./data-table"
import { db } from "@/firebaseConfig"

export default function BookingsPage() {
  const [data, setData] = useState<BookingWithDetails[]>([])
  const [rooms, setRooms] = useState<Room[]>([])

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
          guestId: docData.guestId,
          roomId: docData.roomId,
          checkInDate: docData.checkInDate,
          checkOutDate: docData.checkOutDate,
          status: docData.status,
        } as Booking
      })

      const detailedBookings = bookingsFromDb
        .map((booking) => {
          const guest = guests.find((g) => g.id === booking.guestId)
          const room = rooms.find((r) => r.id === booking.roomId)
          if (!guest || !room) {
            return null
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-headline">Reservas</CardTitle>
          <CardDescription>
            Gestiona las reservas de los huéspedes y la asignación de habitaciones.
          </CardDescription>
        </div>
        <Button size="sm">
          <PlusCircle className="mr-2 h-4 w-4" />
          Nueva Reserva
        </Button>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={data} />
      </CardContent>
    </Card>
  )
}
