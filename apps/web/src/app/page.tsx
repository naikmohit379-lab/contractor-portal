import type { Metadata } from "next";
import { Hero } from "@/components/marketing/Hero";
import { Navbar } from "@/components/marketing/Navbar";
import { Cta, Footer, ServiceStrip, WaiverBoard, Workflow } from "@/components/marketing/Sections";

export const metadata: Metadata = {
  title: "Roofing contractor portal for measurements, claims, orders and lien waivers",
  alternates: { canonical: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "RoofDesk",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: "Roofing contractor portal for aerial measurements, insurance claim estimates, supplier orders and lien waiver tracking.",
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar />
      <main>
        <Hero />
        <ServiceStrip />
        <Workflow />
        <WaiverBoard />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
