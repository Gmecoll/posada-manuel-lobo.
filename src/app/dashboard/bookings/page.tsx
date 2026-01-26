import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PlusCircle } from "lucide-react"

import { bookings, guests, rooms } from "@/lib/data"
import type { BookingWithDetails } from "./columns"
import { columns } from "./columns"
import { DataTable } from "./data-table"

async function getBookings(): Promise<BookingWithDetails[]> {
  // In a real app, you would fetch this data from your database
  return bookings.map((booking) => {
    const guest = guests.find((g) => g.id === booking.guestId)
    const room = rooms.find((r) => r.id === booking.roomId)
    return {
      ...booking,
      guest: guest!,
      room: room!,
    }
  }).sort((a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime());
}

export default async function BookingsPage() {
  const data = await getBookings()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="font-headline">Bookings</CardTitle>
          <CardDescription>
            Manage guest bookings and room assignments.
          </CardDescription>
        </div>
        <Button size="sm">
          <PlusCircle className="mr-2 h-4 w-4" />
          New Booking
        </Button>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={data} />
      </CardContent>
    </Card>
  )
}
