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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { guests } from "@/lib/data"
import type { Booking, Room } from "@/lib/data"
import { db } from "@/firebaseConfig"

export default function Dashboard() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [recentBookings, setRecentBookings] = useState<Booking[]>([])
  const [checkedInCount, setCheckedInCount] = useState(0)
  const [availableRoomsCount, setAvailableRoomsCount] = useState(0)
  const [totalRoomsCount, setTotalRoomsCount] = useState(0)
  const [allRooms, setAllRooms] = useState<Room[]>([])

  // Listen to rooms collection
  useEffect(() => {
    const roomsCol = collection(db, "rooms")
    const unsubscribe = onSnapshot(roomsCol, (snapshot) => {
      const roomsFromDb = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Room[]
      setAllRooms(roomsFromDb);
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
      
      const recent = bookingsFromDb
        .filter((b) => b.status === 'Checked-In' || b.status === 'Confirmed')
        .sort((a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime())
        .slice(0, 5)
      setRecentBookings(recent)
    })
    return () => unsubscribe()
  }, [])


  return (
    <>
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
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Reservas Recientes</CardTitle>
          <CardDescription>
            Un resumen de las últimas actividades de los huéspedes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Huésped</TableHead>
                <TableHead>Habitación</TableHead>
                <TableHead>Fecha de Check-in</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentBookings.map((booking) => {
                const guest = guests.find((g) => g.id === booking.guestId)
                const room = allRooms.find((r) => r.id === booking.roomId)
                return (
                  <TableRow key={booking.id}>
                    <TableCell>
                      <div className="font-medium">{guest?.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {guest?.email}
                      </div>
                    </TableCell>
                    <TableCell>RM {room?.roomNumber}</TableCell>
                    <TableCell>{booking.checkInDate}</TableCell>
                    <TableCell>
                      <Badge variant={booking.status === 'Checked-In' ? "default" : "secondary"}>{booking.status}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
