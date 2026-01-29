
export type Room = {
  id: string;
  room_number: string;
  type: 'Standard' | 'Deluxe' | 'Suite';
  status: 'Disponible' | 'Ocupada' | 'Limpieza';
  remoteUnlock?: number; // Timestamp for remote unlock
  tuya_device_id?: string;
  codes_pool?: string[];
  backup_code?: string;
  last_rotation?: any;
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
  status: 'Confirmed' | 'Checked-In' | 'Checked-Out' | 'Cancelled' | 'Bloqueada';
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
  { id: 'room-1', room_number: '1', type: 'Standard', status: 'Ocupada', tuya_device_id: 'XXXX' },
  { id: 'room-2', room_number: '2', type: 'Deluxe', status: 'Ocupada', tuya_device_id: 'XXXX' },
  { id: 'room-3', room_number: '3', type: 'Suite', status: 'Limpieza', tuya_device_id: 'XXXX' },
  { 
    id: 'room-4', 
    room_number: '4', 
    type: 'Standard', 
    status: 'Disponible', 
    tuya_device_id: 'vdevo176964136999932',
    codes_pool: [
      '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', '000000',
      '123456', '654321', '789012', '210987', '345678', '876543', '901234', '432109', '567890', '098765'
    ],
    backup_code: '111111'
  },
  { id: 'room-5', room_number: '5', type: 'Deluxe', status: 'Ocupada', tuya_device_id: 'XXXX' },
  { id: 'room-6', room_number: '6', type: 'Standard', status: 'Disponible', tuya_device_id: 'XXXX' },
  { id: 'room-7', room_number: '7', type: 'Standard', status: 'Disponible', tuya_device_id: 'XXXX' },
  { id: 'room-8', room_number: '8', type: 'Suite', status: 'Ocupada', tuya_device_id: 'XXXX' },
  { id: 'room-9', room_number: '9', type: 'Deluxe', status: 'Limpieza', tuya_device_id: 'XXXX' },
  { id: 'room-10', room_number: '10', type: 'Standard', status: 'Disponible', tuya_device_id: 'XXXX' },
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
