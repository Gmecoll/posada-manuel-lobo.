
"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy
} from "firebase/firestore"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { QrCodeDialog } from "@/components/qr-code-dialog"
import { PlusCircle } from "lucide-react"

import type { Room, Booking } from "@/lib/data"
import type { BookingWithDetails } from "./columns"
import { getColumns } from "./columns"
import { DataTable } from "./data-table"
import { db } from "@/firebaseConfig"
import {
  NewBookingDialog,
  type NewBookingData,
} from "@/components/new-booking-dialog"
import { useToast } from "@/hooks/use-toast"
import { format, parse } from "date-fns"

export default function BookingsPage() {
  const [data, setData] = useState<BookingWithDetails[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomsMap, setRoomsMap] = useState<Map<string, Room>>(new Map())
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false)
  const [bookingToEdit, setBookingToEdit] =
    useState<BookingWithDetails | null>(null)
  const [qrCodeBooking, setQrCodeBooking] =
    useState<BookingWithDetails | null>(null)

  const { toast } = useToast()

  useEffect(() => {
    const roomsCol = collection(db, "rooms")
    const unsubscribe = onSnapshot(
      roomsCol,
      (snapshot) => {
        const roomsFromDb = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Room[]
        setRooms(roomsFromDb);
        const newRoomsMap = new Map<string, Room>();
        roomsFromDb.forEach(room => {
          if(room.room_id_cloudbeds) {
            newRoomsMap.set(room.room_id_cloudbeds, room);
          }
        });
        setRoomsMap(newRoomsMap);
      },
      (error) => {
        console.error("Error fetching rooms:", error)
      }
    )
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (rooms.length === 0) return

    const bookingsQuery = query(collection(db, "bookings"), orderBy("check_in", "desc"));
    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        const bookingsFromDb = snapshot.docs.map((doc) => {
          const docData = doc.data()
          // Map Firestore fields to our Booking type
          return {
            id: doc.id,
            guest_name: docData.guest_name,
            booking_id_cloudbeds: docData.booking_id_cloudbeds || docData.booking_id,
            room_id_cloudbeds: docData.room_id_cloudbeds,
            room_name: docData.room_name || docData.room_number,
            check_in: docData.check_in || docData.checkInDate,
            check_out: docData.check_out || docData.checkOutDate,
            status: docData.status,
            access_enabled: docData.access_enabled,
            rooms: docData.rooms,
          } as Booking
        })

        const detailedBookings = bookingsFromDb
          .map((booking) => {
            const room = roomsMap.get(booking.room_id_cloudbeds) ?? null;
            return {
              ...booking,
              roomId: room?.id ?? '', // Populate firestore doc id for the room
              room,
            }
          })
          .filter((b): b is BookingWithDetails => b !== null)
          

        setData(detailedBookings)
      },
      (error) => {
        console.error("Error fetching bookings:", error)
        setData([])
      }
    )

    return () => unsubscribe()
  }, [rooms, roomsMap])

  const handleAccessToggle = useCallback(
    async (booking: BookingWithDetails, enabled: boolean) => {
      const bookingRef = doc(db, "bookings", booking.id)
      try {
        await updateDoc(bookingRef, { access_enabled: enabled })
        toast({
          title: "Acceso actualizado",
          description: `El acceso para la reserva ${
            booking.booking_id_cloudbeds
          } ha sido ${enabled ? "habilitado" : "deshabilitado"}.`,
        })
      } catch (error) {
        console.error("Error updating access status:", error)
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo actualizar el estado de acceso.",
        })
      }
    },
    [toast]
  )

  const handleCheckIn = useCallback(
    async (booking: BookingWithDetails) => {
      if (!booking.roomId) return;
      const bookingRef = doc(db, "bookings", booking.id)
      const roomRef = doc(db, "rooms", booking.roomId)
      try {
        await updateDoc(bookingRef, {
          status: "Checked-In",
          access_enabled: true,
        })
        await updateDoc(roomRef, { status: "Ocupada" })
        toast({
          title: "Check-in Exitoso",
          description: `Check-in para reserva ${booking.booking_id_cloudbeds} en Habitación ${booking.room?.name}.`,
        })
      } catch (error) {
        console.error("Error during check-in:", error)
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se pudo realizar el check-in.",
        })
      }
    },
    [toast]
  )

  const handleEdit = useCallback((booking: BookingWithDetails) => {
    setBookingToEdit(booking)
    setIsBookingDialogOpen(true)
  }, [])

  const handleDelete = useCallback(async (booking: BookingWithDetails) => {
    if (!booking.roomId) return;
    const bookingRef = doc(db, "bookings", booking.id);
    try {
      if (booking.status === "Checked-In" || booking.status === "checked_in") {
        const roomRef = doc(db, "rooms", booking.roomId);
        await updateDoc(roomRef, { status: "Disponible" });
      }

      await deleteDoc(bookingRef);
      toast({
        title: "Reserva Eliminada",
        description: "La reserva ha sido eliminada exitosamente.",
      });
    } catch (error) {
      console.error("Error deleting booking:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la reserva.",
      });
    }
  }, [toast]);

  const handleShowQr = useCallback((booking: BookingWithDetails) => {
    setQrCodeBooking(booking)
  }, [])

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

      if (!isEditing && selectedRoom.status !== "Disponible") {
        toast({
          variant: "destructive",
          title: "Habitación no disponible",
          description: `La habitación seleccionada ya no está disponible.`,
        })
        return
      }

      const checkIn = parse(bookingData.checkInDate, "dd/MM/yyyy", new Date())
      const checkOut = parse(bookingData.checkOutDate, "dd/MM/yyyy", new Date())

      const bookingToSave = {
        guest_name: bookingData.guest_name,
        booking_id_cloudbeds: bookingData.booking_id,
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

      if (bookingData.status === "Checked-In") {
        const roomRef = doc(db, "rooms", selectedRoom.id)
        await updateDoc(roomRef, { status: "Ocupada" })
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

  const columns = useMemo(
    () =>
      getColumns({
        onAccessToggle: handleAccessToggle,
        onCheckIn: handleCheckIn,
        onShowQr: handleShowQr,
        onEdit: handleEdit,
        onDelete: handleDelete,
      }),
    [
      handleAccessToggle,
      handleCheckIn,
      handleShowQr,
      handleEdit,
      handleDelete,
    ]
  )

  return (
    <>
      <NewBookingDialog
        isOpen={isBookingDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBookingToEdit(null)
          }
          setIsBookingDialogOpen(open)
        }}
        onSave={handleSaveBooking}
        rooms={rooms}
        bookingToEdit={bookingToEdit}
      />

      <QrCodeDialog
        isOpen={!!qrCodeBooking}
        onOpenChange={() => setQrCodeBooking(null)}
        booking={qrCodeBooking}
        room={qrCodeBooking?.room ?? null}
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
          <Button
            size="sm"
            onClick={() => {
              setBookingToEdit(null)
              setIsBookingDialogOpen(true)
            }}
          >
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
