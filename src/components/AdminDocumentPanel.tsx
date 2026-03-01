'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/firebaseConfig';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  type Timestamp,
} from 'firebase/firestore';
import {
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  User,
  ShieldCheck,
  ChevronDown,
  Users,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Skeleton } from './ui/skeleton';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from './ui/badge';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { GuestVerificationModal } from './GuestVerificationModal';
import { cn } from '@/lib/utils';

// Types
type GuestVerification = {
  status: 'pending' | 'completed' | 'unmatch' | 'front_only' | 'back_only' | string;
  name: string;
  avatar_url?: string;
  front_image_url?: string;
  back_image_url?: string;
};

type BookingWithGuests = {
  id: string;
  guest_name: string;
  room_name: string;
  check_in: string;
  guest_count: number;
  document_status?: string;
  guests_verification?: { [key: string]: GuestVerification };
  document_validated_at?: Timestamp;
  comments?: string;
};

// Helper components
const getStatusInfo = (status: string) => {
  switch (status) {
    case 'completed':
      return {
        label: 'Completado',
        icon: <CheckCircle className="h-4 w-4 text-green-500" />,
      };
    case 'unmatch':
      return {
        label: 'No Coincide',
        icon: <XCircle className="h-4 w-4 text-red-500" />,
      };
    case 'front_only':
    case 'back_only':
      return {
        label: 'Parcial',
        icon: <AlertCircle className="h-4 w-4 text-yellow-500" />,
      };
    default:
      return {
        label: 'Pendiente',
        icon: <Clock className="h-4 w-4 text-gray-500" />,
      };
  }
};

const getOverallStatusBadge = (status?: string) => {
    if (!status) return <Badge variant="outline">Pendiente</Badge>;
    if (status === 'approved') {
        return <Badge variant="default" className="bg-green-600 hover:bg-green-700"><ShieldCheck className="mr-1 h-3 w-3" /> Aprobado</Badge>
    }
    if (status.startsWith('unmatch')) {
        return <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" /> Revisión Requerida</Badge>
    }
    if (status.startsWith('partial') || status.startsWith('completed')) {
        return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" /> En Progreso</Badge>
    }
    return <Badge variant="outline">{status}</Badge>
}

// Main component
export const AdminDocumentPanel: React.FC = () => {
  const [bookings, setBookings] = useState<BookingWithGuests[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<GuestVerification | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingWithGuests | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('check_in', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allBookings = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as BookingWithGuests
        );
        const relevantBookings = allBookings.filter(
          (b) => b.guests_verification && Object.keys(b.guests_verification).length > 0
        );
        setBookings(relevantBookings);
        setIsLoading(false);
      },
      (err) => {
        console.error('Error al cargar las reservas:', err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleGuestClick = (guest: GuestVerification, booking: BookingWithGuests) => {
    setSelectedGuest(guest);
    setSelectedBooking(booking);
    setIsModalOpen(true);
  };
  
  const formatCheckinDate = (dateString: string) => {
    if(!dateString) return "N/A";
    try {
        const date = new Date(dateString + 'T00:00:00');
        return format(date, "dd MMM yyyy", { locale: es });
    } catch {
        return dateString;
    }
  }

  if (isLoading) {
    return (
      <div>
        <Card>
          <CardHeader>
            <CardTitle className="font-headline flex items-center gap-2">
              <FileText /> Verificación de Identidad
            </CardTitle>
            <CardDescription>
              Listado de todas las verificaciones de documentos de los huéspedes.
            </CardDescription>
          </CardHeader>
        </Card>
        <div className="border rounded-lg mt-4 p-4 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <FileText /> Verificación de Identidad
          </CardTitle>
          <CardDescription>
            Listado de las verificaciones de documentos de los huéspedes. Haz clic para expandir y ver detalles.
          </CardDescription>
        </CardHeader>
        <CardContent>
            {bookings.length === 0 && !isLoading ? (
                <div className="text-center py-10 border-2 border-dashed rounded-lg">
                    <p className="text-muted-foreground">No hay verificaciones de documentos para mostrar.</p>
                </div>
            ) : (
                <Accordion type="single" collapsible className="w-full">
                    {bookings.map((booking) => (
                        <AccordionItem value={booking.id} key={booking.id}>
                            <AccordionTrigger className="hover:bg-accent/50 px-4 rounded-md">
                                <div className="flex-1 grid grid-cols-5 gap-4 items-center text-left">
                                    <span className="font-semibold col-span-2 truncate">{booking.guest_name}</span>
                                    <span className="text-muted-foreground text-sm">Hab: {booking.room_name}</span>
                                    <span className="text-muted-foreground text-sm">Check-in: {formatCheckinDate(booking.check_in)}</span>
                                    {getOverallStatusBadge(booking.document_status)}
                                </div>
                                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 ml-4" />
                            </AccordionTrigger>
                            <AccordionContent className="p-4 bg-slate-50/50">
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3 flex items-center gap-2"><Users className="h-4 w-4"/> Huéspedes Verificados ({booking.guest_count || Object.keys(booking.guests_verification || {}).length})</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                     {booking.guests_verification && Object.values(booking.guests_verification).map((guest, index) => {
                                        const statusInfo = getStatusInfo(guest.status);
                                        return (
                                            <div key={index} onClick={() => handleGuestClick(guest, booking)} className="flex items-center gap-3 p-3 bg-card rounded-lg border cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                                                <Avatar className="h-10 w-10 border">
                                                    <AvatarImage src={guest.avatar_url} alt={guest.name} />
                                                    <AvatarFallback><User className="h-5 w-5" /></AvatarFallback>
                                                </Avatar>
                                                <div className="flex-grow">
                                                    <p className="font-semibold text-sm">{guest.name}</p>
                                                    <div className="flex items-center gap-1.5">
                                                        {statusInfo.icon}
                                                        <span className="text-xs text-muted-foreground">{statusInfo.label}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                                {booking.comments && (
                                    <div className="mt-4">
                                         <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Comentarios</h4>
                                         <blockquote className="border-l-2 pl-4 text-sm text-muted-foreground italic">
                                            {booking.comments}
                                         </blockquote>
                                    </div>
                                )}
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            )}
        </CardContent>
      </Card>
    </div>
    
    <GuestVerificationModal 
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        guest={selectedGuest}
        bookingId={selectedBooking?.id || null}
        initialComments={selectedBooking?.comments || ''}
    />
    </>
  );
};
