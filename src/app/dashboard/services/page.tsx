
"use client"

import { useState, useEffect, useCallback } from "react"
import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
  addDoc,
  updateDoc,
} from "firebase/firestore"
import * as LucideIcons from "lucide-react"

import { db } from "@/firebaseConfig"
import type { Service } from "@/lib/data"
import { services as initialServices } from "@/lib/data"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { PlusCircle, Edit, RefreshCw } from "lucide-react"
import { ServiceDialog, type ServiceFormData } from "@/components/service-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { DynamicIcon } from "@/components/dynamic-icon"
import { ServicesDashboard } from "@/components/services-dashboard"

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [serviceToEdit, setServiceToEdit] = useState<Service | null>(null)
  const { toast } = useToast()

  // Fetch services from Firestore
  useEffect(() => {
    const servicesCol = collection(db, "services")
    const unsubscribe = onSnapshot(
      servicesCol,
      (snapshot) => {
        const servicesFromDb = snapshot.docs
          .map((doc) => {
            const data = doc.data()
            return {
              id: doc.id,
              title: data.title || data.nombre,
              description: data.description || data.descripcion,
              price: data.price ?? data.precio,
              unidad: data.unidad,
              icon: data.icon || data.icono,
              active: data.active ?? data.activo,
            }
          })
          .sort((a, b) => (a.title || "").localeCompare(b.title || "")) as Service[]
        setServices(servicesFromDb)
        setIsLoading(false)
      },
      (error) => {
        console.error("Error fetching services:", error)
        setIsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  const handleEdit = (service: Service) => {
    setServiceToEdit(service)
    setIsDialogOpen(true)
  }

  const handleAddNew = () => {
    setServiceToEdit(null)
    setIsDialogOpen(true)
  }

  const handleToggleActive = async (service: Service, active: boolean) => {
    const serviceRef = doc(db, "services", service.id)
    try {
      await updateDoc(serviceRef, { active })
      toast({
        title: `Servicio ${active ? "activado" : "desactivado"}`,
        description: `El servicio "${service.title}" ahora está ${
          active ? "activo" : "inactivo"
        }.`,
      })
    } catch (error) {
      console.error("Error updating service status:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar el estado del servicio.",
      })
    }
  }

  const handleSaveService = async (data: ServiceFormData) => {
    try {
      if (serviceToEdit) {
        // Editing existing service
        const serviceRef = doc(db, "services", serviceToEdit.id)
        await updateDoc(serviceRef, data)
        toast({
          title: "Servicio actualizado",
          description: `El servicio "${data.title}" ha sido guardado.`,
        })
      } else {
        // Creating new service
        await addDoc(collection(db, "services"), { ...data, active: true })
        toast({
          title: "Servicio creado",
          description: `El servicio "${data.title}" ha sido añadido.`,
        })
      }
      setIsDialogOpen(false)
      setServiceToEdit(null)
    } catch (error) {
      console.error("Error saving service:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo guardar el servicio.",
      })
    }
  }

  const seedDatabase = async () => {
    const batch = writeBatch(db)
    initialServices.forEach((service) => {
      const docRef = doc(db, "services", service.id)
      batch.set(docRef, {
        title: service.title,
        description: service.description,
        price: service.price,
        unidad: service.unidad,
        icon: service.icon,
        active: service.active,
      })
    })

    try {
      await batch.commit()
      toast({
        title: "Base de datos inicializada",
        description: `Se han agregado ${initialServices.length} servicios de ejemplo.`,
      })
    } catch (error) {
      console.error("Error seeding services: ", error)
      toast({
        variant: "destructive",
        title: "Error de inicialización",
        description: "No se pudieron agregar los servicios.",
      })
    }
  }

  return (
    <>
      <ServiceDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSave={handleSaveService}
        serviceToEdit={serviceToEdit}
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="font-headline">Gestión de Servicios</CardTitle>
              <CardDescription>
                Añade, edita y gestiona los servicios ofrecidos en la posada.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={seedDatabase} variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" />
                Inicializar Datos
              </Button>
              <Button onClick={handleAddNew} size="sm">
                <PlusCircle className="mr-2 h-4 w-4" />
                Nuevo Servicio
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : services.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <p>No hay servicios configurados.</p>
                <p className="text-sm">
                  Haz clic en "Nuevo Servicio" para empezar.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {services.map((service) => (
                  <Card
                    key={service.id}
                    className={cn(!service.active && "bg-muted/50")}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <DynamicIcon
                            name={service.icon as keyof typeof LucideIcons}
                            className="h-8 w-8 text-primary"
                          />
                          <div>
                            <CardTitle>{service.title}</CardTitle>
                            <CardDescription className="text-lg font-semibold text-foreground">
                              ${service.price}{" "}
                              <span className="text-sm font-normal text-muted-foreground">
                                / {service.unidad}
                              </span>
                            </CardDescription>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(service)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {service.description}
                      </p>
                    </CardContent>
                    <CardFooter>
                      <div className="flex w-full items-center justify-between">
                        <span className="text-sm font-medium">
                          {service.active ? "Activo" : "Inactivo"}
                        </span>
                        <Switch
                          checked={service.active}
                          onCheckedChange={(checked) =>
                            handleToggleActive(service, checked)
                          }
                        />
                      </div>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <ServicesDashboard />
      </div>
    </>
  )
}
