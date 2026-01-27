"use client"

import { useState, useEffect } from "react"
import {
  doc,
  onSnapshot,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore"
import { CheckCircle2, QrCode, ShieldOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { cn } from "@/lib/utils"
import { db } from "@/firebaseConfig"
import type { Booking, Room } from "@/lib/data"
import { Skeleton } from "@/components/ui/skeleton"

export default function RoomAccessPage({ params }: { params: { id: string } }) {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const handleUnlock = () => {
    if (!booking || !room) return

    setIsUnlocked(true)
    setTimeout(() => setIsUnlocked(false), 4000) // Reset after 4 seconds

    // Log activity to Firestore
    const activityLogsCol = collection(db, "activity_logs")
    addDoc(activityLogsCol, {
      message: `${booking.guestName} abrió la puerta de la Habitación ${room.roomNumber}.`,
      timestamp: serverTimestamp(),
    }).catch((error) => {
      console.error("Error logging activity:", error)
      // This is a background task, so we won't show an error to the user
    })
  }

  // Listen to booking changes
  useEffect(() => {
    if (!params.id) return
    const bookingRef = doc(db, "bookings", params.id)
    const unsubscribe = onSnapshot(bookingRef, (doc) => {
      if (doc.exists()) {
        setBooking({ id: doc.id, ...doc.data() } as Booking)
      } else {
        setBooking(null)
      }
      setIsLoading(false)
    })
    return () => unsubscribe()
  }, [params.id])

  // Listen to room changes (for remote unlock)
  useEffect(() => {
    if (!booking?.roomId) return
    const roomRef = doc(db, "rooms", booking.roomId)
    const unsubscribe = onSnapshot(roomRef, (doc) => {
      if (doc.exists()) {
        const roomData = { id: doc.id, ...doc.data() } as Room
        setRoom(roomData)

        // Check for remote unlock trigger
        if (
          roomData.remoteUnlock &&
          Date.now() - roomData.remoteUnlock < 5000
        ) {
          // 5-second window
          handleUnlock()
          // Reset the trigger to prevent re-unlocking on refresh
          updateDoc(roomRef, { remoteUnlock: null })
        }
      } else {
        setRoom(null)
      }
    })
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

  const accessDenied = !booking.accessEnabled || booking.status !== "Checked-In"

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4">
      <div className="absolute top-6 left-6">
        <Logo />
      </div>
      <div className="w-full max-w-md text-center">
        <h1 className="font-headline text-3xl md:text-4xl">
          Habitación <span className="text-primary">{room.roomNumber}</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          {isUnlocked
            ? "¡Bienvenido! La puerta está desbloqueada."
            : accessDenied
            ? "Acceso restringido. Contacta con recepción."
            : "Pulsa el botón para desbloquear la puerta."}
        </p>

        <div className="relative mt-12 flex h-80 w-full items-center justify-center">
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center space-y-4 rounded-lg border-2 border-dashed bg-card transition-all duration-500",
              isUnlocked ? "border-green-500 bg-green-50" : "border-primary/50",
              isUnlocked ? "opacity-100 scale-100" : "opacity-0 scale-90"
            )}
          >
            <CheckCircle2 className="h-24 w-24 text-green-600" />
            <span className="text-2xl font-semibold text-green-700">
              Acceso Concedido
            </span>
          </div>

          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center transition-all duration-500",
              isUnlocked ? "opacity-0 scale-110" : "opacity-100 scale-100"
            )}
          >
            {accessDenied ? (
              <div className="flex flex-col items-center gap-4 text-destructive">
                <ShieldOff className="h-24 w-24" />
                <span className="text-xl font-semibold">
                  Acceso Deshabilitado
                </span>
              </div>
            ) : (
              <Button
                variant="default"
                className="h-48 w-48 rounded-full shadow-lg"
                onClick={handleUnlock}
                aria-label="Desbloquear Puerta"
              >
                <div className="flex flex-col items-center gap-2">
                  <QrCode className="h-16 w-16" />
                  <span className="text-lg font-semibold">Desbloquear</span>
                </div>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
