"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, Loader2 } from "lucide-react"
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  type User,
} from "firebase/auth"
import { auth } from "@/firebaseConfig"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function AdminLoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [firebaseError, setFirebaseError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
    })
    // Cleanup subscription on unmount
    return () => unsubscribe()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setFirebaseError(null)

    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.push("/dashboard")
    } catch (firebaseError: any) {
      if (
        firebaseError.code === "auth/invalid-credential" ||
        firebaseError.code === "auth/user-not-found" ||
        firebaseError.code === "auth/wrong-password"
      ) {
        setError("Email o contraseña incorrectos.")
      } else {
        setError("Ocurrió un error inesperado. Por favor, intente de nuevo.")
      }
      setFirebaseError(firebaseError.code || "Error desconocido")
      setIsLoading(false)
    }
  }

  const adminUID = "TGaxvFAyCNRM79L36mN3S4X3qnu2"
  const isUserAdmin = user?.uid === adminUID

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center gap-8 bg-gray-100 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary">
            <ShieldCheck className="size-8 text-primary-foreground" />
          </div>
          <CardTitle className="font-headline text-2xl">
            Panel de Gestión
          </CardTitle>
          <CardDescription>Posada Manuel Lobo</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="pilar@posada.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Acceder"
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="w-full text-center text-xs text-muted-foreground">
            Acceso exclusivo para administradores.
          </p>
        </CardFooter>
      </Card>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Datos de Depuración</CardTitle>
          <CardDescription>
            Credenciales de prueba e información de sesión en tiempo real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campo</TableHead>
                <TableHead>Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Email de prueba</TableCell>
                <TableCell>pilar@posada.com</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Contraseña de prueba</TableCell>
                <TableCell>palta</TableCell>
              </TableRow>
              {user ? (
                <>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="bg-muted text-center font-semibold"
                    >
                      Usuario en Sesión
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Usuario Registrado</TableCell>
                    <TableCell>{user.email}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>UID Actual</TableCell>
                    <TableCell>{user.uid}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Estado de Admin</TableCell>
                    <TableCell>{isUserAdmin ? "SÍ ✅" : "NO ❌"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Nivel de Privilegios</TableCell>
                    <TableCell>
                      {isUserAdmin
                        ? "Control Total (Lectura/Escritura)"
                        : "Solo Lectura / Restringido"}
                    </TableCell>
                  </TableRow>
                </>
              ) : (
                <TableRow>
                  <TableCell>Estado de Sesión</TableCell>
                  <TableCell>No autenticado</TableCell>
                </TableRow>
              )}

              {firebaseError && (
                <TableRow>
                  <TableCell>Último error de Firebase</TableCell>
                  <TableCell className="text-destructive">
                    {firebaseError}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  )
}
