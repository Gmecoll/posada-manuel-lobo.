
"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import type { Service } from "@/lib/data"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"

const serviceFormSchema = z.object({
  title: z
    .string()
    .min(3, { message: "El nombre debe tener al menos 3 caracteres." }),
  description: z.string().min(10, { message: "La descripción es muy corta." }),
  price: z.coerce
    .number()
    .min(0, { message: "El precio no puede ser negativo." }),
  unidad: z
    .string()
    .min(2, { message: "La unidad es requerida (ej: por hora, por persona)." }),
  icon: z
    .string()
    .min(2, { message: "El nombre del ícono de Lucide es requerido." }),
})

export type ServiceFormData = z.infer<typeof serviceFormSchema>

type ServiceDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: ServiceFormData) => void
  serviceToEdit?: Service | null
}

export function ServiceDialog({
  isOpen,
  onOpenChange,
  onSave,
  serviceToEdit,
}: ServiceDialogProps) {
  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      title: "",
      description: "",
      price: 0,
      unidad: "",
      icon: "Plus",
    },
  })

  const isEditing = !!serviceToEdit

  useEffect(() => {
    if (isOpen) {
      if (isEditing && serviceToEdit) {
        form.reset(serviceToEdit)
      } else {
        form.reset({
          title: "",
          description: "",
          price: 0,
          unidad: "",
          icon: "Activity",
        })
      }
    }
  }, [isOpen, serviceToEdit, isEditing, form])

  const onSubmit = (data: ServiceFormData) => {
    onSave(data)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-headline">
            {isEditing ? "Modificar Servicio" : "Nuevo Servicio"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Edite los detalles del servicio."
              : "Complete los detalles para crear un nuevo servicio."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 py-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del Servicio</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Alquiler de Kayak" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe el servicio..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unidad"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidad</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="por hora, por persona..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ícono (Lucide)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Boat, Bike, Utensils"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">
                {isEditing ? "Guardar Cambios" : "Guardar Servicio"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
