
"use client"

import { useState, useEffect, useCallback } from "react"
import {
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore"
import { getFunctions, httpsCallable } from "firebase/functions"
import { CheckCircle2, QrCode, ShieldOff, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Logo } from "@/components/logo"
import { cn } from "@/lib/utils"
import { db, app } from "@/firebaseConfig"
import type { Booking, Room } from "@/lib/data"
import { Skeleton } from "@/components/ui/skeleton"

export default function RoomAccessPage({ params }: { params: { id: string } }) {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [unlockMessage, setUnlockMessage] = useState(
    "Pulsa el botón para desbloquear la puerta."
  )
  const [booking, setBooking] = useState<Booking | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const handleUnlock = useCallback(async () => {
    if (!booking || !room || isUnlocking) return

    if (!room.tuya_device_id || room.tuya_device_id === "XXXX") {
      setUnlockMessage("Cerradura no configurada.")
      setTimeout(
        () => setUnlockMessage("Pulsa el botón para desbloquear la puerta."),
        4000
      )
      return
    }

    setIsUnlocking(true)
    setUnlockMessage("Abriendo...")

    const functions = getFunctions(app)
    const solicitarApertura = httpsCallable(functions, "solicitarAperturaTuya")

    try {
      const result = await solicitarApertura({ 
        deviceId: room.tuya_device_id,
        nombreHuesped: booking.guest_name,
        habitacion: room.roomNumber,
      })
      const resultData = result.data as { success: boolean; [key: string]: any }

      if (resultData.success) {
        setIsUnlocked(true) // Triggers the green checkmark animation
        setUnlockMessage("¡Puerta abierta!")

        setTimeout(() => {
          setIsUnlocked(false)
          setUnlockMessage("Pulsa el botón para desbloquear la puerta.")
        }, 4000)
      } else {
        throw new Error("La API de Tuya no pudo abrir la puerta.")
      }
    } catch (error) {
      console.error("Error al abrir la puerta:", error)
      setUnlockMessage("Error al abrir. Intente de nuevo.")
      setTimeout(() => {
        setUnlockMessage("Pulsa el botón para desbloquear la puerta.")
      }, 4000)
    } finally {
      setIsUnlocking(false)
    }
  }, [booking, room, isUnlocking])

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
  }, [booking?.roomId, handleUnlock])

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
          Habitación <span className="text-primary">{room.roomNumber}</span>
        </h1>
        <p className="mt-2 text-muted-foreground">
          {isUnlocked
            ? "¡Bienvenido! La puerta está desbloqueada."
            : finalAccessDenied
            ? accessExpired
              ? "Acceso Expirado. Contacta con recepción."
              : "Acceso restringido. Contacta con recepción."
            : unlockMessage}
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
            {finalAccessDenied ? (
              <div className="flex flex-col items-center gap-4 text-destructive">
                <ShieldOff className="h-24 w-24" />
                <span className="text-xl font-semibold">
                  {accessExpired ? "Acceso Expirado" : "Acceso Deshabilitado"}
                </span>
              </div>
            ) : (
              <Button
                variant="default"
                className="h-48 w-48 rounded-full shadow-lg"
                onClick={handleUnlock}
                aria-label="Desbloquear Puerta"
                disabled={isUnlocking}
              >
                {isUnlocking ? (
                  <Loader2 className="h-16 w-16 animate-spin" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <QrCode className="h-16 w-16" />
                    <span className="text-lg font-semibold">Desbloquear</span>
                  </div>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
