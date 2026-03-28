import FloatingStars from './FloatingStars';
import HeroSection from './HeroSection';
import LandingSections from './LandingSections';
import Navbar from './Navbar';

const SparkleLanding = () => (
  <div className="sparkle-theme relative min-h-screen overflow-x-hidden">
    <FloatingStars />
    <Navbar />
    <HeroSection />
    <LandingSections />
  </div>
);

export default SparkleLanding;
