
"use client"

import React, { useState, useEffect } from "react"
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
} from "firebase/firestore"
import { addDays, format, differenceInDays, startOfDay, parse } from "date-fns"
import { es } from "date-fns/locale"
import { Plus, GripVertical, RefreshCw } from "lucide-react"

import { db } from "@/firebaseConfig"
import type { Room, Booking } from "@/lib/data"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { NewBookingDialog, type NewBookingData } from "./new-booking-dialog"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card"
import { Skeleton } from "./ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs"

const getRoomNumber = (name: string) => {
  if (!name) return 0;
  const match = name.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};

export function BookingRack() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [roomsMap, setRoomsMap] = useState<Map<string, Room>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [viewRange, setViewRange] = useState<number>(30);
  
  const [isSyncing, setIsSyncing] = useState(false) 
  
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false)
  const [bookingToEdit, setBookingToEdit] =
    useState<(Booking & { room: Room | null }) | null>(null)
  const [newBookingDefaults, setNewBookingDefaults] = useState<{
    roomId: string
    checkInDate: string
  } | null>(null)
  const { toast } = useToast()

  const handleManualSync = async () => {
    setIsSyncing(true)
    toast({
      title: "Sincronizando...",
      description: "Obteniendo datos frescos de Cloudbeds.",
    })

    try {
        const activeBookingIds = [...new Set(bookings.map(b => b.booking_id_cloudbeds))].filter(Boolean);
        
        const webhookUrl = "https://webhookcloudbeds-kms3iex6ya-uc.a.run.app";

        let successCount = 0;

        for (const cloudbedsId of activeBookingIds) {
             try {
                 await fetch(`${webhookUrl}?reservationID=${cloudbedsId}`);
                 successCount++;
             } catch (e) {
                 console.warn(`Fallo sincronizando ${cloudbedsId}`);
             }
        }

        toast({
            title: "Sincronización Completa",
            description: `Se actualizaron ${successCount} reservas desde Cloudbeds.`,
        })
    } catch (error) {
        toast({
            variant: "destructive",
            title: "Error",
            description: "Falló la sincronización con Cloudbeds.",
        })
    } finally {
        setIsSyncing(false)
    }
  }

  useEffect(() => {
    setIsLoading(true);
    const roomsCol = collection(db, "rooms")
    const unsubscribeRooms = onSnapshot(
      roomsCol,
      (snapshot) => {
        const roomsFromDb = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          } as Room)) 
          .sort(
            (a, b) => getRoomNumber(a.name) - getRoomNumber(b.name)
          )
        setRooms(roomsFromDb)

        const newRoomsMap = new Map<string, Room>();
        roomsFromDb.forEach(room => {
          if(room.room_id_cloudbeds) {
            newRoomsMap.set(room.room_id_cloudbeds, room);
          }
        });
        setRoomsMap(newRoomsMap);
        
        if (snapshot.size > 0) {
          setIsLoading(false)
        }
      },
      (error) => {
        console.error("Error fetching rooms for rack:", error)
        setIsLoading(false)
      }
    )

    return () => unsubscribeRooms()
  }, [])

  useEffect(() => {
    if (roomsMap.size === 0) return;

    const bookingsCol = collection(db, "bookings")
    const unsubscribeBookings = onSnapshot(
      bookingsCol,
      (snapshot) => {
        const bookingsFromDb = snapshot.docs.flatMap((doc) => {
          const data = doc.data()
          
          if (data.rooms && Array.isArray(data.rooms) && data.rooms.length > 0) {
            return data.rooms.map((roomData: any) => {
              const room = roomsMap.get(roomData.room_id_cloudbeds);
              return {
                id: `${doc.id}-${roomData.room_id_cloudbeds}`, 
                docId: doc.id,
                ...data,
                roomId: room ? room.id : '',
                room_name: roomData.room_name 
              } as Booking;
            });
          }

          const room = data.room_id_cloudbeds ? roomsMap.get(data.room_id_cloudbeds) : null;
          return [{ 
              id: doc.id, 
              docId: doc.id,
              ...data,
              roomId: room ? room.id : '',
            } as Booking]
        })
        setBookings(bookingsFromDb)
      },
      (error) => {
        console.error("Error fetching bookings for rack:", error)
      }
    )

    return () => unsubscribeBookings()
  }, [roomsMap])

  const today = startOfDay(new Date())
  const days = Array.from({ length: viewRange }, (_, i) => addDays(today, i))

  const getBookingSegments = (roomId: string) => {
    const roomBookings = bookings
      .filter((b) => b.roomId === roomId && b.status !== "Cancelled")
      .sort(
        (a, b) =>
          new Date(a.check_in).getTime() - new Date(b.check_in).getTime()
      )

    const segments: { booking: Booking; start: number; span: number }[] = []

    roomBookings.forEach((booking) => {
      const checkIn = startOfDay(new Date(booking.check_in + "T00:00:00"))
      const checkOut = startOfDay(new Date(booking.check_out + "T00:00:00"))

      if (checkOut <= today || checkIn > days[days.length - 1]) {
        return
      }

      const startDay = checkIn < today ? today : checkIn
      const endDay =
        checkOut > addDays(days[days.length - 1], 1)
          ? addDays(days[days.length - 1], 1)
          : checkOut

      const startIndex = differenceInDays(startDay, today)
      let duration = differenceInDays(endDay, startDay)

      if (duration > 0 && startIndex < viewRange) {
        if (startIndex + duration > viewRange) {
            duration = viewRange - startIndex
        }
        segments.push({
          booking: booking,
          start: startIndex,
          span: duration,
        })
      }
    })
    return segments
  }

  const handleOpenNewBookingDialog = (roomId: string, date: Date) => {
    setNewBookingDefaults({
      roomId,
      checkInDate: format(date, "dd/MM/yyyy"),
    })
    setBookingToEdit(null)
    setIsBookingDialogOpen(true)
  }

  const handleBookingClick = (booking: Booking) => {
    const room = rooms.find((r) => r.id === booking.roomId) ?? null
    if (room) {
      setBookingToEdit({ ...booking, room })
      setNewBookingDefaults(null)
      setIsBookingDialogOpen(true)
    }
  }

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

      const checkIn = parse(bookingData.checkInDate, "dd/MM/yyyy", new Date())
      const checkOut = parse(bookingData.checkOutDate, "dd/MM/yyyy", new Date())

      const bookingToSave = {
        guest_name: bookingData.guest_name,
        booking_id_cloudbeds: bookingData.status === 'Bloqueada' ? `block-${new Date().getTime()}` : bookingData.booking_id,
        room_id_cloudbeds: selectedRoom.room_id_cloudbeds,
        room_name: selectedRoom.name,
        check_in: format(checkIn, "yyyy-MM-dd"),
        check_out: format(checkOut, "yyyy-MM-dd"),
        status: bookingData.status,
        access_enabled: bookingData.status === "Checked-In",
      }

      if (isEditing && bookingToEdit) {
        if (!bookingToEdit.docId) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "ID de documento de reserva no encontrado.",
          })
          return
        }
        const bookingRef = doc(db, "bookings", bookingToEdit.docId)
        await updateDoc(bookingRef, bookingToSave)
        toast({
          title: "Reserva actualizada",
          description: "Los cambios se han guardado correctamente.",
        })
      } else {
        await addDoc(collection(db, "bookings"), bookingToSave)
        toast({
          title: "Reserva Creada",
          description: "La nueva reserva ha sido guardada exitosamente.",
        })
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

  const bookingStatusColors: Record<string, string> = {
    Confirmed: "bg-blue-500 border-blue-700 text-white",
    "Checked-In": "bg-green-500 border-green-700 text-white",
    checked_in: "bg-green-500 border-green-700 text-white",
    "Checked-Out": "bg-gray-400 border-gray-600 text-white",
    Bloqueada: "bg-red-500 border-red-700 text-white",
  }

  const getCellWidth = (range: number) => {
    if (range <= 1) return '300px';
    if (range <= 7) return '100px';
    return '60px';
  };
  const cellWidth = getCellWidth(viewRange);

  return (
    <>
      <Card className="inline-block">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
           <div className="space-y-1">
            <CardTitle className="font-headline">Rack de Reservas</CardTitle>
            <CardDescription>
              Visualización de la ocupación para el período seleccionado.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Tabs defaultValue="30" onValueChange={(value) => setViewRange(Number(value))} className="w-auto">
              <TabsList>
                <TabsTrigger value="1">1D</TabsTrigger>
                <TabsTrigger value="7">7D</TabsTrigger>
                <TabsTrigger value="30">30D</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleManualSync} 
              disabled={isSyncing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
              {isSyncing ? "Sinc..." : "Actualizar"}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="relative inline-block overflow-x-auto border rounded-lg mt-4">
           {isLoading ? (
             <div className="p-4">
                <Skeleton className="h-10 w-full mb-1" />
                <Skeleton className="h-64 w-full" />
             </div>
           ) : (
            <div
              className="inline-grid bg-border -m-px"
              style={{
                gridTemplateColumns: `160px repeat(${days.length}, ${cellWidth})`,
              }}
            >
              {/* Header */}
              <div className="sticky left-0 z-30 flex items-center justify-start p-2 font-semibold bg-card border-b border-r">
                Habitación
              </div>
              {days.map((day) => (
                <div
                  key={day.toString()}
                  className="flex flex-col items-center justify-center p-1 text-center bg-card border-b border-r"
                >
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    {format(day, "eee", { locale: es })}
                  </div>
                  <div className={cn(
                      "text-lg font-bold",
                      format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd') && "text-primary"
                    )}>
                    {format(day, "d")}
                  </div>
                </div>
              ))}

              {/* Body Rows */}
              {rooms.map((room, roomIndex) => (
                <React.Fragment key={room.id}>
                  {/* Room Label */}
                  <div className="sticky left-0 z-20 flex flex-col items-start justify-center p-2 bg-card border-b border-r">
                    <div className="font-semibold">{room.name}</div>
                    <div className="text-xs text-muted-foreground">{room.type_name}</div>
                  </div>

                  {/* Day Cells for the room */}
                  {days.map((day, dayIndex) => (
                    <div
                      key={`${room.id}-${day.toString()}`}
                      style={{
                        gridRow: roomIndex + 2,
                        gridColumn: dayIndex + 2,
                      }}
                      className="relative min-h-[60px] bg-background border-b border-r group"
                    >
                       <Button
                        variant="ghost"
                        size="icon"
                        className="h-full w-full opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleOpenNewBookingDialog(room.id, day)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </React.Fragment>
              ))}

              {/* Booking Segments */}
              {rooms.flatMap((room, roomIndex) => 
                getBookingSegments(room.id).map(
                    ({ booking, start, span }) => (
                      <div
                        key={booking.id}
                        className={cn(
                          "z-10 m-1 flex cursor-pointer items-center overflow-hidden rounded-md border p-2 text-xs font-semibold shadow-sm transition-all hover:brightness-110",
                          bookingStatusColors[booking.status] || "bg-gray-500"
                        )}
                        style={{
                          gridRow: roomIndex + 2,
                          gridColumn: `${start + 2} / span ${span}`,
                        }}
                        onClick={() => handleBookingClick(booking)}
                      >
                        <GripVertical className="h-4 w-4 mr-1 text-white/50" />
                        <span className="truncate">{booking.guest_name}</span>
                      </div>
                    )
                  )
              )}

            </div>
           )}
          </div>
        </CardContent>
      </Card>
      
      <NewBookingDialog
        isOpen={isBookingDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBookingToEdit(null)
            setNewBookingDefaults(null)
          }
          setIsBookingDialogOpen(open)
        }}
        onSave={handleSaveBooking}
        rooms={rooms}
        bookingToEdit={bookingToEdit}
        defaultValues={newBookingDefaults ?? undefined}
      />
    </>
  )
}
