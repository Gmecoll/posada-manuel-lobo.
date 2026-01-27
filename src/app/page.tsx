"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function AdminLoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (username === "Pilar" && password === "palta") {
      router.push("/dashboard")
    } else {
      setError("Credenciales incorrectas. Por favor, intente de nuevo.")
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-gray-100 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary">
                <ShieldCheck className="size-8 text-primary-foreground" />
            </div>
            <CardTitle className="font-headline text-2xl">Panel de Gestión</CardTitle>
            <CardDescription>Posada Manuel Lobo</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                type="text"
                placeholder="Pilar"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
              ) : "Acceder"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
            <p className="w-full text-center text-xs text-muted-foreground">Acceso exclusivo para administradores.</p>
        </CardFooter>
      </Card>
    </main>
  )
}
