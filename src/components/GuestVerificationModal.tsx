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
import { FileImage, Download } from 'lucide-react';

type GuestVerification = {
  name: string;
  avatar_url?: string;
  front_image_url?: string;
  back_image_url?: string;
  passport_url?: string;
  is_passport?: boolean;
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

  const [displayedImage, setDisplayedImage] = useState('');
  const [activeView, setActiveView] = useState<'front' | 'back' | 'passport'>('front');

  useEffect(() => {
    if (isOpen) {
      setComments(initialComments || '');
      if (guest) {
        if (guest.is_passport) {
          setDisplayedImage(guest.passport_url || '');
          setActiveView('passport');
        } else {
          const initialUrl = guest.front_image_url || guest.back_image_url || '';
          setDisplayedImage(initialUrl);
          setActiveView(guest.front_image_url ? 'front' : 'back');
        }
      }
    }
  }, [isOpen, initialComments, guest]);

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

  const handleDownload = async () => {
    if (!displayedImage) return;
    try {
        const response = await fetch(displayedImage);
        if (!response.ok) throw new Error('Network response was not ok.');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = displayedImage.split('/').pop()?.split('?')[0] || 'documento.jpg';
        a.download = decodeURIComponent(filename);
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error downloading image:", error);
        toast({
            variant: "destructive",
            title: "Error de descarga",
            description: "No se pudo descargar la imagen.",
        });
    }
  };

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
              {displayedImage ? (
                <Image
                  src={displayedImage}
                  alt={`Documento de ${guest?.name}`}
                  fill
                  style={{ objectFit: "contain" }}
                />
              ) : (
                <div className="text-center text-muted-foreground">
                    <FileImage className="mx-auto h-10 w-10"/>
                    <p className="text-xs mt-2">Imagen del documento no disponible</p>
                </div>
              )}
            </div>
             <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">Vistas del Documento</h4>
                <div className="flex gap-2">
                    {guest?.is_passport ? (
                        <Button size="sm" variant={activeView === 'passport' ? 'default' : 'outline'} disabled>Pasaporte</Button>
                    ) : (
                        <>
                            <Button size="sm" variant={activeView === 'front' ? 'default' : 'outline'} onClick={() => { guest?.front_image_url && setDisplayedImage(guest.front_image_url); setActiveView('front'); }} disabled={!guest?.front_image_url}>Frente</Button>
                            <Button size="sm" variant={activeView === 'back' ? 'default' : 'outline'} onClick={() => { guest?.back_image_url && setDisplayedImage(guest.back_image_url); setActiveView('back'); }} disabled={!guest?.back_image_url}>Dorso</Button>
                        </>
                    )}
                </div>
            </div>
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
        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between sm:items-center w-full">
            <Button onClick={handleDownload} variant="outline" disabled={!displayedImage}>
                <Download className="mr-2 h-4 w-4" />
                Descargar Vista Actual
            </Button>
            <div className="flex justify-end gap-2">
                <DialogClose asChild>
                    <Button type="button" variant="ghost">
                    Cerrar
                    </Button>
                </DialogClose>
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Guardando...' : 'Guardar Comentarios'}
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
