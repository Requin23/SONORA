import { NextRequest, NextResponse } from "next/server";
import { getAdminAccounts, isValidBasicAuth } from "@/lib/adminAuth";

// Protege la page /admin, les routes API dediees admin (/api/admin/*) et
// l'ajout de livrable. Le changement de statut reste volontairement gere dans
// la route API : un client connecte doit pouvoir passer EN_ATTENTE ->
// EN_VERIFICATION, tandis que les statuts admin restent controles serveur.
//
// Auth HTTP Basic simple : suffisant pour un MVP a usage interne, mais a
// remplacer par une vraie session/JWT si plus de 2 admins ou un vrai risque
// de partage de mot de passe existent.
function isProtectedRequest(pathname: string, method: string) {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname.startsWith("/api/admin/")) return true;
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
