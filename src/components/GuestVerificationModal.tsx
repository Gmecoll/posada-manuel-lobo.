'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { FileImage } from 'lucide-react';
import { cn } from '@/lib/utils';

type GuestVerification = {
  name: string;
  avatar_url?: string;
  front_image_url?: string;
  back_image_url?: string;
};

type GuestVerificationModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  guest: GuestVerification | null;
  bookingId: string | null;
  initialComments: string;
};

export function GuestVerificationModal({
  isOpen,
  onOpenChange,
  guest,
  bookingId,
  initialComments,
}: GuestVerificationModalProps) {
  const [comments, setComments] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setComments(initialComments || '');
    }
  }, [isOpen, initialComments]);

  const handleSave = async () => {
    if (!bookingId) return;
    setIsSaving(true);
    const bookingRef = doc(db, 'bookings', bookingId);
    try {
      await updateDoc(bookingRef, { comments });
      toast({
        title: 'Comentarios guardados',
        description: 'Los comentarios de la reserva han sido actualizados.',
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving comments:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron guardar los comentarios.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const docImage = guest?.front_image_url || guest?.back_image_url;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Verificación de {guest?.name}</DialogTitle>
          <DialogDescription>
            Revise la imagen del documento y agregue comentarios si es necesario.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Documento</h3>
            <div className="border rounded-lg p-2 bg-muted/50 aspect-video relative flex items-center justify-center">
              {docImage ? (
                <Image
                  src={docImage}
                  alt={`Documento de ${guest?.name}`}
                  fill
                  objectFit="contain"
                />
              ) : (
                <div className="text-center text-muted-foreground">
                    <FileImage className="mx-auto h-10 w-10"/>
                    <p className="text-xs mt-2">Imagen del documento no disponible</p>
                </div>
              )}
            </div>
             <Alert>
                <AlertTitle className="text-sm">Imágenes disponibles</AlertTitle>
                <AlertDescription className="text-xs flex gap-4">
                    <a href={guest?.front_image_url || '#'} target="_blank" rel="noopener noreferrer" className={cn("hover:underline", !guest?.front_image_url && "text-muted-foreground pointer-events-none")}>Ver Frente</a>
                    <a href={guest?.back_image_url || '#'} target="_blank" rel="noopener noreferrer" className={cn("hover:underline", !guest?.back_image_url && "text-muted-foreground pointer-events-none")}>Ver Dorso</a>
                </AlertDescription>
            </Alert>
          </div>
          <div className="space-y-4 flex flex-col">
            <h3 className="font-semibold text-sm">Comentarios de la Reserva</h3>
            <Textarea
              placeholder="Añada notas, observaciones o información relevante sobre la verificación de esta reserva..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              className="flex-grow min-h-[200px]"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cerrar
            </Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar Comentarios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
