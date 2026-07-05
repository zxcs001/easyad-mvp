import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { Toaster } from "./component/toast";
import Chatbot from "./component/chatbot";

export const metadata: Metadata = {
  title: "OOH Market MVP",
  description: "Geospatial out-of-home advertising marketplace portal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}<Chatbot /><Toaster /></body>
    </html>
  );
}
