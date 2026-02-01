'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, type DocumentData } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface ServiceRequest extends DocumentData {
  id: string;
  guestName: string;
  nombreServicio: string;
  roomNumber: string;
  monto: number;
  currency: string;
}

export function ServiceRequestNotifier() {
  const [newRequests, setNewRequests] = useState<ServiceRequest[]>([]);
  const [currentRequest, setCurrentRequest] = useState<ServiceRequest | null>(null);
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Pre-load the audio element.
    // IMPORTANT: You must add a `notification.mp3` file to your `/public` folder.
    audioRef.current = new Audio('/notification.mp3');
    audioRef.current.load();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'solicitudes_servicios'),
      where('leido', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const requestData = { id: change.doc.id, ...change.doc.data() } as ServiceRequest;
          setNewRequests((prevRequests) => [...prevRequests, requestData]);
        }
      });
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (newRequests.length > 0 && !currentRequest) {
      const nextRequest = newRequests[0];
      setCurrentRequest(nextRequest);
      
      // Play sound
      if (audioRef.current) {
        audioRef.current.play().catch(error => {
          // Autoplay can be blocked by the browser. A user interaction with the page is usually required first.
          console.warn("Audio playback failed. Please interact with the page first.", error);
        });
      }
    }
  }, [newRequests, currentRequest]);

  const handleMarkAsRead = async () => {
    if (!currentRequest) return;

    const requestRef = doc(db, 'solicitudes_servicios', currentRequest.id);
    try {
      await updateDoc(requestRef, { leido: true });
      toast({
        title: 'Solicitud marcada como leída',
        description: `La solicitud de ${currentRequest.nombreServicio} ha sido marcada.`,
      });
    } catch (error) {
      console.error('Error marking request as read:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo marcar la solicitud como leída.',
      });
    } finally {
      // Remove the processed request and show the next one if available
      setNewRequests((prev) => prev.slice(1));
      setCurrentRequest(null);
    }
  };

  if (!currentRequest) {
    return null;
  }
  
  const currencySymbol = currentRequest.currency === 'USD' ? 'U$S' : 'UY$';

  return (
    <AlertDialog open={!!currentRequest} onOpenChange={() => {
        // Prevent closing without action by not changing state
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-headline text-2xl">¡Nueva Solicitud de Servicio!</AlertDialogTitle>
          <AlertDialogDescription className="text-base pt-4 space-y-2 text-foreground">
              <p><strong>Huésped:</strong> {currentRequest.guestName}</p>
              <p><strong>Habitación:</strong> {currentRequest.roomNumber || 'N/A'}</p>
              <p><strong>Servicio:</strong> {currentRequest.nombreServicio}</p>
              <p><strong>Monto:</strong> {currencySymbol} {currentRequest.monto}</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleMarkAsRead}>
            Marcar como visto
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
