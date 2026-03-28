import { motion } from "framer-motion";
import { Download, Globe } from "lucide-react";
import AppMockup from "./AppMockup";
import { Link } from "react-router-dom";
import { DEVCORD_INSTALLER_URL } from "../../api";

function downloadInstaller() {
  const href = DEVCORD_INSTALLER_URL || "/updates/win/Devcord_Installer.exe";
  const sep = href.includes("?") ? "&" : "?";
  window.location.href = `${href}${sep}t=${Date.now()}`;
}

const HeroSection = () => (
  <section className="relative min-h-screen bg-hero-gradient pt-24 pb-16 flex items-center overflow-hidden">
    <div className="container mx-auto px-4 lg:px-8">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
        {/* Left column */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-gradient-hero text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black uppercase leading-[0.95] tracking-tight mb-6">
            Czat stworzony dla deweloperów i graczy
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-xl mb-8">
            Devcord to Twoje miejsce do pisania kodu, grania i rozmów ze znajomymi bez lagów. Open-source, 1080p 240fps streaming i wbudowane AI odszumiające.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={downloadInstaller}
              className="bg-foreground text-background font-bold text-base px-8 py-3.5 rounded-full flex items-center justify-center gap-2.5 hover:bg-foreground/90 transition-colors hover:scale-[1.03] active:scale-[0.98] transition-transform"
            >
              <Download size={20} />
              Pobierz dla systemu Windows
            </button>
            <Link to="/app" className="bg-muted/60 text-foreground font-bold text-base px-8 py-3.5 rounded-full flex items-center justify-center gap-2.5 border border-border/40 hover:bg-muted transition-colors hover:scale-[1.03] active:scale-[0.98] transition-transform">
              <Globe size={20} />
              Otwórz w przeglądarce
            </Link>
          </div>
        </motion.div>

        {/* Right column */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <AppMockup />
        </motion.div>
      </div>
    </div>
  </section>
);

export default HeroSection;
