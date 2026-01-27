
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { collection, getDocs, query, where } from "firebase/firestore"
import { Building, KeyRound, Loader2 } from "lucide-react"

import { db } from "@/firebaseConfig"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Booking } from "@/lib/data"

export default function GuestLoginPage() {
  const [roomNumber, setRoomNumber] = useState("")
  const [booking_id, setBookingId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const normalizedRoomNumber = roomNumber.trim()
    const normalizedBookingId = booking_id.trim()

    if (!normalizedRoomNumber || !normalizedBookingId) {
      setError("Por favor, ingrese el número de habitación y su ID de reserva.")
      setIsLoading(false)
      return
    }

    try {
      const bookingsQuery = query(
        collection(db, "bookings"),
        where("booking_id", "==", normalizedBookingId),
        where("room_number", "==", normalizedRoomNumber)
      )
      const bookingsSnapshot = await getDocs(bookingsQuery)

      if (bookingsSnapshot.empty) {
        setError(
          "ID de reserva o número de habitación incorrecto. Por favor, verifique sus datos."
        )
        setIsLoading(false)
        return
      }

      const foundBooking = {
        id: bookingsSnapshot.docs[0].id,
        ...bookingsSnapshot.docs[0].data(),
      } as Booking

      if (foundBooking.accessEnabled && foundBooking.status === "Checked-In") {
        router.push(`/access/${foundBooking.id}`)
      } else {
        setError(
          "El acceso para esta reserva no está habilitado o la reserva no está activa. Contacte con recepción."
        )
      }
    } catch (err) {
      console.error("Error during login verification:", err)
      setError("Ocurrió un error al verificar su reserva. Intente nuevamente.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary">
            <Building className="size-8 text-primary-foreground" />
          </div>
          <CardTitle className="font-headline text-3xl">POSADA</CardTitle>
          <CardDescription className="text-xl">MANUEL LOBO</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label
                htmlFor="room"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Habitación
              </Label>
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
              <Label
                htmlFor="booking_id"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Número de Reserva (Cloudbeds)
              </Label>
              <Input
                id="booking_id"
                type="text"
                placeholder="1234567"
                value={booking_id}
                onChange={(e) => setBookingId(e.target.value)}
                required
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              variant="default"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
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
          <p className="text-center text-xs text-muted-foreground">
            Bienvenido a su hogar en el casco histórico.
          </p>
        </CardFooter>
      </Card>
    </main>
  )
}
