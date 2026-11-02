import type { Metadata } from "next";
import { Hero } from "@/components/marketing/Hero";
import { Navbar } from "@/components/marketing/Navbar";
import { Cta, Footer, ServiceStrip, Workflow } from "@/components/marketing/Sections";

export const metadata: Metadata = {
  title: "Roofing contractor portal for Indian roofers",
  alternates: { canonical: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Roofora",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: "Roofora helps Indian roofing contractors manage roof measurements, INR estimates, quotations, supplier orders and operations in one place.",
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
        <Cta />
      </main>
      <Footer />
    </>
  );
}
