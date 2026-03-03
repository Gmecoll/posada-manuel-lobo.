
export type Room = {
  id: string;
  lockId?: string;
  name: string;
  type_name: string;
  status: 'Disponible' | 'Ocupada' | 'Limpieza';
  codes_pool?: string[];
  backup_code?: string;
  last_rotation?: any;
  room_id_cloudbeds?: string;
};

export type Guest = {
  id: string;
  name: string;
  email: string;
};

export type RoomInfo = {
  sub_reservation_id: string;
  room_id_cloudbeds: string | null;
  room_name: string;
  lock_id: string | null;
  guest_count: number;
}

export type Booking = {
  id: string;
  guest_name: string;
  booking_id_cloudbeds: string;
  room_id_cloudbeds: string;
  roomId: string; // This is the firestore doc id, populated client-side
  room_name: string;
  check_in: string;
  check_out: string;
  status: 'Confirmed' | 'Checked-In' | 'Checked-Out' | 'Cancelled' | 'Bloqueada' | 'checked_in';
  access_enabled: boolean;
  guest_count?: number;
  document_status?: 'pending' | 'approved' | 'manual_review' | 'not_uploaded' | 'pending_review';
  document_url?: string;
  ocr_text?: string;
  document_validated_at?: any;
  comments?: string;
  rooms?: RoomInfo[];
};

export type Service = {
  id: string;
  title: string;
  description: string;
  price: number;
  currency?: 'USD' | 'UYU';
  unidad: string;
  availableHours: string;
  imageUrl?: string;
  active: boolean;
};

export type ServiceRequest = {
  id: string;
  servicioId: string;
  nombreServicio: string;
  monto: number;
  currency: 'USD' | 'UYU';
  cantidad: number;
  fecha: any; // Firestore timestamp
  estado_pago: 'pendiente' | 'completado';
  usuarioId: string; // Could be guest name or booking id
};

export const guests: Guest[] = [
  { id: 'guest-1', name: 'Alice Johnson', email: 'alice@example.com' },
  { id: 'guest-2', name: 'Bob Williams', email: 'bob@example.com' },
  { id: 'guest-3', name: 'Charlie Brown', email: 'charlie@example.com' },
  { id: 'guest-4', name: 'Diana Miller', email: 'diana@example.com' },
  { id: 'guest-5', name: 'Ethan Davis', email: 'ethan@example.com' },
  { id: 'guest-6', name: 'Fiona Garcia', email: 'fiona@example.com' },
];

// This is now just initial data for populating firestore. The app will read from Firestore.
export const rooms: Omit<Room, 'id'>[] = [
  { name: '1', type_name: 'Standard', status: 'Ocupada', lockId: "Sin Definir" },
  { name: '2', type_name: 'Deluxe', status: 'Ocupada', lockId: "Sin Definir" },
  { name: '3', type_name: 'Suite', status: 'Limpieza', lockId: "Sin Definir" },
  { 
    name: '4', 
    type_name: 'Standard', 
    status: 'Disponible',
    lockId: '29074468',
    codes_pool: [
      '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', '000000',
      '123456', '654321', '789012', '210987', '345678', '876543', '901234', '432109', '567890', '098765'
    ],
    backup_code: '111111'
  },
  { name: '5', type_name: 'Deluxe', status: 'Ocupada', lockId: "Sin Definir" },
  { name: '6', type_name: 'Standard', status: 'Disponible', lockId: "Sin Definir" },
  { name: '7', type_name: 'Standard', status: 'Disponible', lockId: "Sin Definir" },
  { name: '8', type_name: 'Suite', status: 'Ocupada', lockId: "Sin Definir" },
  { name: '9', type_name: 'Deluxe', status: 'Limpieza', lockId: "Sin Definir" },
  { name: '10', type_name: 'Standard', status: 'Disponible', lockId: "Sin Definir" },
].map((room, index) => ({ ...room, id: `room-${index + 1}` }));


export const bookings: Booking[] = [
  {
    id: 'booking-1',
    guest_name: 'John Doe',
    booking_id_cloudbeds: 'cb12345',
    roomId: 'room-1',
    room_name: '1',
    check_in: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0],
    check_out: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString().split('T')[0],
    status: 'Checked-In',
    access_enabled: true,
    room_id_cloudbeds: 'cloudbeds-room-1',
  },
  {
    id: 'booking-3',
    guest_name: 'Peter Jones',
    booking_id_cloudbeds: 'cb12347',
    roomId: 'room-8',
    room_name: '8',
    check_in: new Date().toISOString().split('T')[0],
    check_out: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString().split('T')[0],
    status: 'Confirmed',
    access_enabled: true,
    room_id_cloudbeds: 'cloudbeds-room-8',
  },
  {
    id: 'booking-4',
    guest_name: 'Mary Williams',
    booking_id_cloudbeds: 'cb12348',
    roomId: 'room-5',
    room_name: '5',
    check_in: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0],
    check_out: new Date(new Date().setDate(new Date().getDate() + 4)).toISOString().split('T')[0],
    status: 'Confirmed',
    access_enabled: false,
    room_id_cloudbeds: 'cloudbeds-room-5',
  },
  {
    id: 'booking-5',
    guest_name: 'Chris Brown',
    booking_id_cloudbeds: 'cb12349',
    roomId: 'room-1',
    room_name: '1',
    check_in: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString().split('T')[0],
    check_out: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString().split('T')[0],
    status: 'Checked-Out',
    access_enabled: false,
    room_id_cloudbeds: 'cloudbeds-room-1',
  },
  {
    id: 'booking-6',
    guest_name: 'Patricia Green',
    booking_id_cloudbeds: 'cb12350',
    roomId: 'room-4',
    room_name: '4',
    check_in: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    check_out: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString().split('T')[0],
    status: 'Cancelled',
    access_enabled: false,
    room_id_cloudbeds: 'cloudbeds-room-4',
  },
];

export const services: Service[] = [
  {
    id: 'service-1',
    title: 'Alquiler de Kayak',
    description: 'Disfruta de un paseo por el Río de la Plata. Incluye remos y chaleco salvavidas.',
    price: 25,
    currency: 'USD',
    unidad: 'por hora',
    availableHours: '9:00 AM - 6:00 PM',
    imageUrl: `https://picsum.photos/seed/kayak/400/300`,
    active: true,
  },
  {
    id: 'service-2',
    title: 'Paseo a Caballo',
    description: 'Recorre los campos y viñedos cercanos con nuestros caballos mansos. Guía incluido.',
    price: 1500,
    currency: 'UYU',
    unidad: 'por persona',
    availableHours: '10:00 AM - 5:00 PM',
    imageUrl: `https://picsum.photos/seed/horse/400/300`,
    active: true,
  },
    {
    id: 'service-3',
    title: 'Canasta de Picada',
    description: 'Una selección de quesos, fiambres y pan casero para disfrutar al atardecer.',
    price: 1200,
    currency: 'UYU',
    unidad: 'para 2 personas',
    availableHours: 'A coordinar',
    imageUrl: `https://picsum.photos/seed/picnic/400/300`,
    active: false,
  },
];
