import type { Metadata } from "next";
import AppRoute from "../app-route";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Civic Screen Operations — EasyAD Platform",
  description: "Secure screen fleet and public-message operations for institutions and local government.",
};

type GovernmentPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function GovernmentPage({ searchParams }: GovernmentPageProps) {
  return <AppRoute searchParams={searchParams} surface="government" />;
}
