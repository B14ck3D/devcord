import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import FloatingStars from "@/components/FloatingStars";
import LandingSections from "@/components/LandingSections";

const Index = () => (
  <div className="relative min-h-screen overflow-x-hidden">
    <FloatingStars />
    <Navbar />
    <HeroSection />
    <LandingSections />
  </div>
);

export default Index;
