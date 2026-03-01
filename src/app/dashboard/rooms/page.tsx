
"use client"

import { useState, useEffect } from "react"
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { db } from "@/firebaseConfig"
import type { Room } from "@/lib/data"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { MoreVertical } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const statusColors: Record<string, string> = {
  Disponible: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
  Ocupada: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100",
  Limpieza:
    "bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100",
}

const getRoomNumber = (name: string) => {
  if (!name) return 0;
  const match = name.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
};


export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const { toast } = useToast()

  useEffect(() => {
    const roomsCol = collection(db, "rooms")
    const unsubscribe = onSnapshot(
      roomsCol,
      (snapshot) => {
        const roomsFromDb = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          // Ensure data is sorted by room number (as numbers)
          .sort(
            (a, b) =>
              getRoomNumber(a.name) - getRoomNumber(b.name)
          ) as Room[]
        setRooms(roomsFromDb)
      },
      (error) => {
        console.error("Error fetching rooms:", error)
        setRooms([])
      }
    )

    return () => unsubscribe()
  }, [])

  const handleStatusChange = async (
    roomId: string,
    newStatus: Room["status"]
  ) => {
    const roomRef = doc(db, "rooms", roomId)
    try {
      await updateDoc(roomRef, { status: newStatus })
      toast({
        title: "Estado actualizado",
        description: `La habitación ahora está ${newStatus}.`,
      })
    } catch (error) {
      console.error("Error updating room status:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar el estado de la habitación.",
      })
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-headline">
              Gestión de Habitaciones
            </CardTitle>
            <CardDescription>
              Visualiza y actualiza el estado de cada habitación en tiempo real.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      {rooms.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="mb-4 text-muted-foreground">
              No se encontraron habitaciones en la base de datos o se están
              cargando.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rooms.map((room) => (
            <Card key={room.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>Habitación {room.name}</CardTitle>
                    <CardDescription>{room.type_name}</CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="-mt-1 -mr-2 h-8 w-8"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(room.id, "Disponible")}
                      >
                        Marcar Disponible
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(room.id, "Ocupada")}
                      >
                        Marcar Ocupada
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(room.id, "Limpieza")}
                      >
                        Marcar en Limpieza
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <Badge
                  className={cn(
                    "text-sm font-semibold",
                    statusColors[room.status]
                  )}
                  variant="outline"
                >
                  {room.status}
                </Badge>
              </CardContent>
              <CardFooter className="flex-col items-start gap-4 pt-6">
                <div className="w-full">
                  <p className="text-xs text-muted-foreground">
                    Cód. Cerradura
                  </p>
                  <p
                    className={cn(
                      "font-mono text-base font-bold tracking-wider",
                      !room.lockId || room.lockId === "Sin Definir"
                        ? "text-muted-foreground"
                        : "text-foreground"
                    )}
                  >
                    {room.lockId || "Sin Definir"}
                  </p>
                </div>

                {room.codes_pool && room.codes_pool.length > 0 && (
                  <div className="w-full pt-4 mt-4 border-t">
                    <p className="text-xs text-muted-foreground">
                      Cód. Emergencia
                    </p>
                    <p className="font-mono text-xl font-bold tracking-widest">
                      {room.backup_code}
                    </p>
                    {room.last_rotation && (
                      <p className="text-xs text-muted-foreground">
                        Rotado:{" "}
                        {format(
                          new Date(room.last_rotation.seconds * 1000),
                          "dd/MM/yy HH:mm'hs'",
                          { locale: es }
                        )}
                      </p>
                    )}
                  </div>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
