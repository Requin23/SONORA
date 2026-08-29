import { NextRequest, NextResponse } from "next/server";
import { getAdminAccounts, isValidBasicAuth } from "@/lib/adminAuth";

// Protege la page /admin, les routes API dediees admin (/api/admin/*) ainsi
// que les deux actions d'administration exposees ailleurs dans l'API
// (changement de statut, ajout de livrable). Le reste de l'API (creation de
// commande, checkout, webhooks, consultation client) reste public / gere par
// des sessions client (voir src/lib/auth.ts), puisque necessaire au parcours
// client.
//
// Auth HTTP Basic simple : suffisant pour un MVP a usage interne, mais a
// remplacer par une vraie session/JWT si plus de 2 admins ou un vrai risque
// de partage de mot de passe existent.
function isProtectedRequest(pathname: string, method: string) {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname.startsWith("/api/admin/")) return true;
  if (method === "PATCH" && /^\/api\/orders\/[^/]+\/status$/.test(pathname)) return true;
  if (method === "POST" && /^\/api\/orders\/[^/]+\/deliverable$/.test(pathname)) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedRequest(pathname, request.method)) {
    return NextResponse.next();
  }

  if (getAdminAccounts().length === 0) {
    // Refuse par defaut plutot que de laisser /admin ouvert si la
    // configuration est incomplete (fail closed, pas fail open).
    return new NextResponse(
      "Acces admin non configure (definir au moins ADMIN_USER et ADMIN_PASSWORD).",
      { status: 500 },
    );
  }

  if (isValidBasicAuth(request.headers.get("authorization"))) {
    return NextResponse.next();
  }

  return new NextResponse("Authentification requise", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Sonora Admin"' },
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
