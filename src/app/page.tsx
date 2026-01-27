"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { collection, getDocs } from "firebase/firestore"
import { Building, KeyRound, Loader2 } from "lucide-react"

import { db } from "@/firebaseConfig"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Booking, Room } from "@/lib/data"

export default function GuestLoginPage() {
  const [roomNumber, setRoomNumber] = useState("")
  const [guestName, setGuestName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (!roomNumber || !guestName) {
      setError("Por favor, ingrese el número de habitación y su nombre.")
      setIsLoading(false)
      return
    }

    try {
      // It's inefficient to scan all docs, but for a small "Posada" it's ok.
      const roomsRef = collection(db, "rooms")
      const roomsSnapshot = await getDocs(roomsRef)
      const allRooms = roomsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Room[]

      const bookingsRef = collection(db, "bookings")
      const bookingsSnapshot = await getDocs(bookingsRef)
      const allBookings = bookingsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Booking[]

      // Find booking matching guest name (case-insensitive)
      const matchingBookings = allBookings.filter(
        (booking) => booking.guestName.toLowerCase().trim() === guestName.toLowerCase().trim()
      )
      
      if (matchingBookings.length === 0) {
        setError("No se encontró su reserva. Verifique que el nombre y habitación sean correctos.")
        setIsLoading(false)
        return
      }
      
      let foundBooking: Booking | null = null;
      for (const booking of matchingBookings) {
        const room = allRooms.find((r) => r.id === booking.roomId)
        if (room) {
          // Extract number from room name e.g. "Habitación 4" -> "4"
          const roomNumberFromDb = (room.roomNumber.match(/\d+/) || [])[0]
          if (roomNumberFromDb === roomNumber.trim()) {
            foundBooking = booking
            break
          }
        }
      }

      if (foundBooking) {
        if (foundBooking.accessEnabled && foundBooking.status === "Checked-In") {
          router.push(`/access/${foundBooking.id}`)
        } else {
          setError("El acceso para esta reserva no está habilitado o la reserva no está activa. Contacte con recepción.")
        }
      } else {
        setError("No se encontró su reserva. Verifique que el nombre y habitación sean correctos.")
      }
    } catch (err) {
      console.error(err)
      setError("Ocurrió un error al verificar su reserva. Intente nuevamente.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive">
                <Building className="size-8 text-destructive-foreground" />
            </div>
            <CardTitle className="font-headline text-3xl">POSADA</CardTitle>
            <CardDescription className="text-xl">MANUEL LOBO</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="room" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Habitación</Label>
              <Input
                id="room"
                type="text"
                placeholder="4"
                value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nombre / Apellido</Label>
              <Input
                id="name"
                type="text"
                placeholder="Pepe"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" variant="destructive" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-5 w-5" />
              )}
              Ingresar
            </Button>
          </form>
        </CardContent>
        <CardFooter className="mt-4 justify-center">
            <p className="text-center text-xs text-muted-foreground">Bienvenido a su hogar en el casco histórico.</p>
        </CardFooter>
      </Card>
    </main>
  )
}