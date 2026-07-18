import ClientShell from "./ClientShell";

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return <ClientShell path={path} />;
}
