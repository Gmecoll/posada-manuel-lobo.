
"use client"

import { useState, useEffect } from "react"
import { collection, onSnapshot } from "firebase/firestore"
import {
  Activity,
  BedDouble,
  Users,
  CalendarCheck2,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Booking, Room } from "@/lib/data"
import { db } from "@/firebaseConfig"
import { BookingRack } from "@/components/booking-rack"
import AdminLockPanel from "@/components/AdminLockPanel"
import { Separator } from "@/components/ui/separator"

export default function Dashboard() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [checkedInCount, setCheckedInCount] = useState(0)
  const [availableRoomsCount, setAvailableRoomsCount] = useState(0)
  const [totalRoomsCount, setTotalRoomsCount] = useState(0)

  // Listen to rooms collection
  useEffect(() => {
    const roomsCol = collection(db, "rooms")
    const unsubscribe = onSnapshot(roomsCol, (snapshot) => {
      const roomsFromDb = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Room[]
      const available = roomsFromDb.filter(
        (room) => room.status === "Disponible"
      ).length
      setAvailableRoomsCount(available)
      setTotalRoomsCount(snapshot.size)
    })
    return () => unsubscribe()
  }, [])
  
  // Listen to bookings collection
  useEffect(() => {
    const bookingsCol = collection(db, "bookings")
    const unsubscribe = onSnapshot(bookingsCol, (snapshot) => {
      const bookingsFromDb = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }) as Booking)
      
      setBookings(bookingsFromDb)

      const checkedIn = bookingsFromDb.filter(
        (b) => b.status === "Checked-In"
      ).length
      setCheckedInCount(checkedIn)
    })
    return () => unsubscribe()
  }, [])


  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reservas Totales</CardTitle>
            <CalendarCheck2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bookings.length}</div>
            <p className="text-xs text-muted-foreground">
              en el último mes
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Huéspedes Registrados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{checkedInCount}</div>
            <p className="text-xs text-muted-foreground">
              Actualmente en la posada
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Habitaciones Disponibles</CardTitle>
            <BedDouble className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availableRoomsCount}</div>
            <p className="text-xs text-muted-foreground">
              De {totalRoomsCount} habitaciones
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actividad Reciente</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+573</div>
            <p className="text-xs text-muted-foreground">
              +20.1% desde el mes pasado
            </p>
          </CardContent>
        </Card>
      </div>
      
      <BookingRack />

      <Separator className="my-10" />

      <AdminLockPanel />

    </div>
  )
}
