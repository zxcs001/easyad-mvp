import MarketplacePage from "./page";

export type AppSurface = "marketplace" | "government";

export default async function AppRoute({
  searchParams,
  surface,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  surface: AppSurface;
}) {
  const params = (await searchParams) ?? {};
  return <MarketplacePage searchParams={Promise.resolve({ ...params, __surface: surface })} />;
}
