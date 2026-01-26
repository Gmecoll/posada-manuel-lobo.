export type Room = {
  id: string;
  roomNumber: string;
  type: 'Standard' | 'Deluxe' | 'Suite';
  isAvailable: boolean;
};

export type Guest = {
  id: string;
  name: string;
  email: string;
};

export type Booking = {
  id: string;
  guestId: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  status: 'Confirmed' | 'Checked-In' | 'Checked-Out' | 'Cancelled';
};

export const guests: Guest[] = [
  { id: 'guest-1', name: 'Alice Johnson', email: 'alice@example.com' },
  { id: 'guest-2', name: 'Bob Williams', email: 'bob@example.com' },
  { id: 'guest-3', name: 'Charlie Brown', email: 'charlie@example.com' },
  { id: 'guest-4', name: 'Diana Miller', email: 'diana@example.com' },
  { id: 'guest-5', name: 'Ethan Davis', email: 'ethan@example.com' },
  { id: 'guest-6', name: 'Fiona Garcia', email: 'fiona@example.com' },
];

export const rooms: Room[] = [
  { id: 'room-1', roomNumber: '101', type: 'Standard', isAvailable: false },
  { id: 'room-2', roomNumber: '102', type: 'Deluxe', isAvailable: false },
  { id: 'room-3', roomNumber: '201', type: 'Suite', isAvailable: false },
  { id: 'room-4', roomNumber: '202', type: 'Standard', isAvailable: true },
  { id: 'room-5', roomNumber: '301', type: 'Deluxe', isAvailable: false },
  { id: 'room-6', roomNumber: '302', type: 'Standard', isAvailable: false },
];

export const bookings: Booking[] = [
  {
    id: 'booking-1',
    guestId: 'guest-1',
    roomId: 'room-1',
    checkInDate: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString().split('T')[0],
    status: 'Checked-In',
  },
  {
    id: 'booking-2',
    guestId: 'guest-2',
    roomId: 'room-2',
    checkInDate: new Date().toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() + 3)).toISOString().split('T')[0],
    status: 'Confirmed',
  },
  {
    id: 'booking-3',
    guestId: 'guest-3',
    roomId: 'room-3',
    checkInDate: new Date().toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() + 5)).toISOString().split('T')[0],
    status: 'Confirmed',
  },
  {
    id: 'booking-4',
    guestId: 'guest-4',
    roomId: 'room-5',
    checkInDate: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() + 4)).toISOString().split('T')[0],
    status: 'Confirmed',
  },
  {
    id: 'booking-5',
    guestId: 'guest-5',
    roomId: 'room-6',
    checkInDate: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString().split('T')[0],
    status: 'Checked-Out',
  },
  {
    id: 'booking-6',
    guestId: 'guest-6',
    roomId: 'room-4',
    checkInDate: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    checkOutDate: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString().split('T')[0],
    status: 'Cancelled',
  },
];
