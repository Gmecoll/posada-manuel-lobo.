"use client"

import { useState, useEffect } from "react"
import { collection, doc, onSnapshot, updateDoc, writeBatch } from "firebase/firestore"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { db } from "@/firebaseConfig"
import type { Room } from "@/lib/data"
import { rooms as initialRooms } from "@/lib/data"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { RefreshCw } from "lucide-react"

type RoomStatus = "Disponible" | "Ocupada" | "Limpieza"

const statusColors: Record<RoomStatus, string> = {
  Disponible: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
  Ocupada: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100",
  Limpieza: "bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100",
}

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const { toast } = useToast()

  useEffect(() => {
    const roomsCol = collection(db, "rooms")
    const unsubscribe = onSnapshot(roomsCol, (snapshot) => {
      const roomsFromDb = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        // Ensure data is sorted by room number (as numbers)
        .sort((a, b) => parseInt(a.roomNumber ?? '0') - parseInt(b.roomNumber ?? '0')) as Room[]
      setRooms(roomsFromDb)
    })

    return () => unsubscribe()
  }, [])

  const handleStatusChange = async (roomId: string, newStatus: RoomStatus) => {
    const roomRef = doc(db, "rooms", roomId)
    try {
      await updateDoc(roomRef, { status: newStatus })
      toast({
        title: "Estado actualizado",
        description: `La habitación ahora está ${newStatus}.`,
      })
    } catch (error) {
      console.error("Error updating room status: ", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar el estado de la habitación.",
      })
    }
  }

  const seedDatabase = async () => {
    const batch = writeBatch(db)
    initialRooms.forEach((room) => {
      const docRef = doc(db, "rooms", room.id)
      batch.set(docRef, { 
        roomNumber: room.roomNumber,
        type: room.type,
        status: room.status,
        remoteUnlock: null,
      })
    })

    try {
      await batch.commit()
      toast({
        title: "Base de datos inicializada",
        description: `Se han agregado/actualizado ${initialRooms.length} habitaciones.`,
      })
    } catch (error) {
      console.error("Error seeding database: ", error)
      toast({
        variant: "destructive",
        title: "Error de inicialización",
        description: "No se pudieron agregar los datos de las habitaciones.",
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-headline">Gestión de Habitaciones</CardTitle>
            <CardDescription>
              Visualiza y actualiza el estado de cada habitación en tiempo real.
            </CardDescription>
          </div>
           <Button onClick={seedDatabase} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Inicializar/Reinicializar Datos
          </Button>
        </CardHeader>
      </Card>

      {rooms.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="mb-4 text-muted-foreground">
              No se encontraron habitaciones en la base de datos o se están cargando.
            </p>
            <p className="mb-4 text-sm text-muted-foreground">
              Si la base de datos está vacía, puedes usar el botón de arriba para inicializarla con datos de ejemplo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rooms.map((room) => (
            <Card key={room.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>Habitación {room.roomNumber}</CardTitle>
                <CardDescription>{room.type}</CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <Badge
                  className={cn(
                    "text-sm font-semibold",
                    statusColors[room.status as RoomStatus]
                  )}
                  variant="outline"
                >
                  {room.status}
                </Badge>
              </CardContent>
              <CardFooter>
                <Select
                  value={room.status}
                  onValueChange={(newStatus: RoomStatus) =>
                    handleStatusChange(room.id, newStatus)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Cambiar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Disponible">Disponible</SelectItem>
                    <SelectItem value="Ocupada">Ocupada</SelectItem>
                    <SelectItem value="Limpieza">Limpieza</SelectItem>
                  </SelectContent>
                </Select>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
