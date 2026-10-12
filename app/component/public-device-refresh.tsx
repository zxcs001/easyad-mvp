"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PublicDeviceRefresh() {
  const router = useRouter();
  useEffect(() => { const timer = setInterval(() => router.refresh(), 10000); return () => clearInterval(timer); }, [router]);
  return null;
}
