import {
  Activity,
  BedDouble,
  Users,
  CalendarCheck2,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { bookings, guests, rooms } from "@/lib/data"

export default function Dashboard() {
  const checkedInBookings = bookings.filter(
    (b) => b.status === "Checked-In"
  ).length
  const availableRooms = rooms.filter((r) => r.isAvailable).length
  const recentBookings = bookings
    .filter((b) => b.status === 'Checked-In' || b.status === 'Confirmed')
    .slice(0, 5)

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <CalendarCheck2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bookings.length}</div>
            <p className="text-xs text-muted-foreground">
              +2 from last month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Guests Checked-In</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{checkedInBookings}</div>
            <p className="text-xs text-muted-foreground">
              Currently in hotel
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rooms Available</CardTitle>
            <BedDouble className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availableRooms}</div>
            <p className="text-xs text-muted-foreground">
              Out of {rooms.length} rooms
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+573</div>
            <p className="text-xs text-muted-foreground">
              +20.1% from last month
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Recent Bookings</CardTitle>
          <CardDescription>
            An overview of the latest guest activities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Check-in Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentBookings.map((booking) => {
                const guest = guests.find((g) => g.id === booking.guestId)
                const room = rooms.find((r) => r.id === booking.roomId)
                return (
                  <TableRow key={booking.id}>
                    <TableCell>
                      <div className="font-medium">{guest?.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {guest?.email}
                      </div>
                    </TableCell>
                    <TableCell>RM {room?.roomNumber}</TableCell>
                    <TableCell>{booking.checkInDate}</TableCell>
                    <TableCell>
                      <Badge variant={booking.status === 'Checked-In' ? "default" : "secondary"}>{booking.status}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
