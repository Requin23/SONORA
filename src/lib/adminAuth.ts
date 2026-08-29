// Logique d'authentification admin (HTTP Basic) partagee entre le middleware
// (protection de /admin et /api/admin/*) et les routes API (verification
// ponctuelle d'ownership sur une commande). Reste compatible Edge runtime :
// pas d'API Node-only, uniquement atob() et process.env.

export type AdminAccount = { user: string; password: string };

// Jusqu'a 2 comptes admin, definis via des paires de variables d'environnement :
//   ADMIN_USER   / ADMIN_PASSWORD   (compte 1, obligatoire)
//   ADMIN_USER_2 / ADMIN_PASSWORD_2 (compte 2, optionnel)
export function getAdminAccounts(): AdminAccount[] {
  const accounts: AdminAccount[] = [];

  const user1 = process.env.ADMIN_USER;
  const password1 = process.env.ADMIN_PASSWORD;
  if (user1 && password1) accounts.push({ user: user1, password: password1 });

  const user2 = process.env.ADMIN_USER_2;
  const password2 = process.env.ADMIN_PASSWORD_2;
  if (user2 && password2) accounts.push({ user: user2, password: password2 });

  return accounts;
}

export function isValidBasicAuth(authHeader: string | null): boolean {
  if (!authHeader?.startsWith("Basic ")) return false;

  const accounts = getAdminAccounts();
  if (accounts.length === 0) return false;

  const decoded = atob(authHeader.slice("Basic ".length));
  const separatorIndex = decoded.indexOf(":");
  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  return accounts.some((account) => account.user === user && account.password === password);
}
