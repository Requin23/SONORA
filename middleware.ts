import { NextRequest, NextResponse } from "next/server";

// Protege la page /admin ainsi que les deux actions d'administration
// exposees par l'API (changement de statut, ajout de livrable). Le reste de
// l'API (creation de commande, checkout, webhooks, consultation) reste
// public puisque necessaire au parcours client.
//
// Auth HTTP Basic simple : suffisant pour un MVP a usage interne, mais a
// remplacer par une vraie session/JWT si plus de 2 admins ou un vrai risque
// de partage de mot de passe existent.
function isProtectedRequest(pathname: string, method: string) {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (method === "PATCH" && /^\/api\/orders\/[^/]+\/status$/.test(pathname)) return true;
  if (method === "POST" && /^\/api\/orders\/[^/]+\/deliverable$/.test(pathname)) return true;
  return false;
}

// Jusqu'a 2 comptes admin, definis via des paires de variables d'environnement :
//   ADMIN_USER   / ADMIN_PASSWORD   (compte 1, obligatoire)
//   ADMIN_USER_2 / ADMIN_PASSWORD_2 (compte 2, optionnel)
function getAdminAccounts(): Array<{ user: string; password: string }> {
  const accounts: Array<{ user: string; password: string }> = [];

  const user1 = process.env.ADMIN_USER;
  const password1 = process.env.ADMIN_PASSWORD;
  if (user1 && password1) accounts.push({ user: user1, password: password1 });

  const user2 = process.env.ADMIN_USER_2;
  const password2 = process.env.ADMIN_PASSWORD_2;
  if (user2 && password2) accounts.push({ user: user2, password: password2 });

  return accounts;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedRequest(pathname, request.method)) {
    return NextResponse.next();
  }

  const accounts = getAdminAccounts();

  if (accounts.length === 0) {
    // Refuse par defaut plutot que de laisser /admin ouvert si la
    // configuration est incomplete (fail closed, pas fail open).
    return new NextResponse(
      "Acces admin non configure (definir au moins ADMIN_USER et ADMIN_PASSWORD).",
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    if (accounts.some((account) => account.user === user && account.password === password)) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentification requise", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Sonora Admin"' },
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
