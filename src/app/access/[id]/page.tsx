
"use client"

import { useState, useEffect } from "react"
import {
  doc,
  onSnapshot,
} from "firebase/firestore"
import { KeyRound, ShieldOff } from "lucide-react"

import { Logo } from "@/components/logo"
import { db } from "@/firebaseConfig"
import type { Booking, Room } from "@/lib/data"
import { Skeleton } from "@/components/ui/skeleton"

export default function RoomAccessPage({ params }: { params: { id: string } }) {
  const [booking, setBooking] = useState<Booking | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Listen to booking changes
  useEffect(() => {
    if (!params.id) return
    const bookingRef = doc(db, "bookings", params.id)
    const unsubscribe = onSnapshot(
      bookingRef,
      (doc) => {
        if (doc.exists()) {
          setBooking({ id: doc.id, ...doc.data() } as Booking)
        } else {
          setBooking(null)
        }
        setIsLoading(false)
      },
      (error) => {
        console.error("Error fetching booking:", error)
        setIsLoading(false)
        setBooking(null)
      }
    )
    return () => unsubscribe()
  }, [params.id])

  // Listen to room changes (for backup code)
  useEffect(() => {
    if (!booking?.roomId) return
    const roomRef = doc(db, "rooms", booking.roomId)
    const unsubscribe = onSnapshot(
      roomRef,
      (doc) => {
        if (doc.exists()) {
          const roomData = { id: doc.id, ...doc.data() } as Room
          setRoom(roomData)
        } else {
          setRoom(null)
        }
      },
      (error) => {
        console.error("Error fetching room:", error)
        setRoom(null)
      }
    )
    return () => unsubscribe()
  }, [booking?.roomId])

  if (isLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center">
          <Skeleton className="mx-auto h-10 w-3/4" />
          <Skeleton className="mx-auto mt-4 h-6 w-full" />
          <div className="mt-12 flex h-80 w-full items-center justify-center">
            <Skeleton className="h-48 w-48 rounded-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!booking || !room) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4 text-center">
        <Logo />
        <h1 className="mt-8 font-headline text-3xl text-destructive">
          Reserva no encontrada
        </h1>
        <p className="mt-2 text-muted-foreground">
          El enlace de acceso puede ser inválido o haber expirado.
        </p>
      </div>
    )
  }

  const accessDeniedByStatus =
    !booking.access_enabled || booking.status !== "Checked-In"

  // Date validation logic
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()) // Date without time
  let accessExpired = false
  if (booking.checkInDate && booking.checkOutDate) {
    // Firestore dates are 'yyyy-MM-dd'. Appending T00:00:00 treats them as local time at midnight.
    const checkInDate = new Date(booking.checkInDate + "T00:00:00")
    const checkOutDate = new Date(booking.checkOutDate + "T00:00:00")

    // Access is valid from the start of check-in day through the end of check-out day.
    if (today < checkInDate || today > checkOutDate) {
      accessExpired = true
    }
  }

  const finalAccessDenied = accessDeniedByStatus || accessExpired

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4">
      <div className="absolute top-6 left-6">
        <Logo />
      </div>
      <div className="w-full max-w-md text-center">
        <h1 className="font-headline text-3xl md:text-4xl">
          Habitación <span className="text-primary">{room.room_number}</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          {finalAccessDenied
            ? accessExpired
              ? "Acceso Expirado. Contacta con recepción."
              : "Acceso restringido. Contacta con recepción."
            : room.backup_code
            ? "Utiliza el siguiente código para acceder."
            : "Código no disponible. Contacta con recepción."}
        </p>

        <div className="relative mt-12 flex h-80 w-full items-center justify-center">
            {finalAccessDenied ? (
              <div className="flex flex-col items-center gap-4 text-destructive">
                <ShieldOff className="h-24 w-24" />
                <span className="text-xl font-semibold">
                  {accessExpired ? "Acceso Expirado" : "Acceso Deshabilitado"}
                </span>
              </div>
            ) : (
               <div className="flex flex-col items-center justify-center space-y-4 rounded-lg border-2 border-dashed bg-card p-8 w-full">
                <KeyRound className="h-12 w-12 text-primary" />
                <span className="text-sm uppercase tracking-widest text-muted-foreground">Código de Acceso</span>
                <p className="font-mono text-5xl font-bold tracking-widest text-foreground">
                  {room.backup_code || "----"}
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
