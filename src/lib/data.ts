
export type Room = {
  id: string;
  roomNumber: string;
  type: 'Standard' | 'Deluxe' | 'Suite';
  status: 'Disponible' | 'Ocupada' | 'Limpieza';
  remoteUnlock?: number; // Timestamp for remote unlock
};

export type Guest = {
  id: string;
  name: string;
  email: string;
};

export type Booking = {
  id: string;
  guest_name: string;
  booking_id: string;
  roomId: string;
  room_number: string;
  checkInDate: string;
  checkOutDate: string;
  status: 'Confirmed' | 'Checked-In' | 'Checked-Out' | 'Cancelled';
  access_enabled: boolean;
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
export const rooms: Room[] = [
  { id: 'room-1', roomNumber: '1', type: 'Standard', status: 'Ocupada' },
  { id: 'room-2', roomNumber: '2', type: 'Deluxe', status: 'Ocupada' },
  { id: 'room-3', roomNumber: '3', type: 'Suite', status: 'Limpieza' },
  { id: 'room-4', roomNumber: '4', type: 'Standard', status: 'Disponible' },
  { id: 'room-5', roomNumber: '5', type: 'Deluxe', status: 'Ocupada' },
  { id: 'room-6', roomNumber: '6', type: 'Standard', status: 'Disponible' },
  { id: 'room-7', roomNumber: '7', type: 'Standard', status: 'Disponible' },
  { id: 'room-8', roomNumber: '8', type: 'Suite', status: 'Ocupada' },
  { id: 'room-9', roomNumber: '9', type: 'Deluxe', status: 'Limpieza' },
  { id: 'room-10', roomNumber: '10', type: 'Standard', status: 'Disponible' },
];

export const bookings: Booking[] = [
  {
    id: 'booking-1',
    guest_name: 'John Doe',
    booking_id: 'cb12345',
    roomId: 'room-1',
    room_number: '1',
    checkInDate: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString().split('T')[0],
    status: 'Checked-In',
    access_enabled: true,
  },
  {
    id: 'booking-2',
    guest_name: 'Jane Smith',
    booking_id: 'cb12346',
    roomId: 'room-2',
    room_number: '2',
    checkInDate: new Date().toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() + 3)).toISOString().split('T')[0],
    status: 'Confirmed',
    access_enabled: false,
  },
  {
    id: 'booking-3',
    guest_name: 'Peter Jones',
    booking_id: 'cb12347',
    roomId: 'room-8',
    room_number: '8',
    checkInDate: new Date().toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString().split('T')[0],
    status: 'Confirmed',
    access_enabled: true,
  },
  {
    id: 'booking-4',
    guest_name: 'Mary Williams',
    booking_id: 'cb12348',
    roomId: 'room-5',
    room_number: '5',
    checkInDate: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() + 4)).toISOString().split('T')[0],
    status: 'Confirmed',
    access_enabled: false,
  },
  {
    id: 'booking-5',
    guest_name: 'Chris Brown',
    booking_id: 'cb12349',
    roomId: 'room-1',
    room_number: '1',
    checkInDate: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString().split('T')[0],
    status: 'Checked-Out',
    access_enabled: false,
  },
  {
    id: 'booking-6',
    guest_name: 'Patricia Green',
    booking_id: 'cb12350',
    roomId: 'room-4',
    room_number: '4',
    checkInDate: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString().split('T')[0],
    status: 'Cancelled',
    access_enabled: false,
  },
];
