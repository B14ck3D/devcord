import { TerminalSquare, Menu, X } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";

const navLinks = [
  { label: "Funkcje", href: "#funkcje" },
  { label: "Prywatność", href: "#prywatnosc" },
  { label: "Dla deweloperów", href: "#deweloperzy" },
];

const Navbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-glass border-b border-border/30">
      <div className="container mx-auto flex items-center justify-between h-16 px-4 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <TerminalSquare className="text-primary" size={28} strokeWidth={2.5} />
          <span className="text-foreground font-black text-xl tracking-tight">Devcord</span>
        </div>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-muted-foreground text-sm font-semibold hover:text-foreground transition-colors duration-200 relative after:content-[''] after:absolute after:bottom-[-2px] after:left-0 after:w-full after:h-[2px] after:bg-primary after:scale-x-0 after:origin-right after:transition-transform after:duration-300 hover:after:scale-x-100 hover:after:origin-left"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <Link to="/app" className="hidden lg:block bg-foreground text-background font-bold text-sm px-6 py-2.5 rounded-full hover:bg-foreground/90 transition-colors">
          Otwórz Devcord
        </Link>

        {/* Mobile toggle */}
        <button className="lg:hidden text-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-glass border-t border-border/30 overflow-hidden"
          >
            <div className="flex flex-col items-center gap-4 py-6">
              {navLinks.map((link) => (
                <a key={link.label} href={link.href} className="text-muted-foreground font-semibold hover:text-foreground transition-colors">
                  {link.label}
                </a>
              ))}
              <Link to="/app" className="bg-foreground text-background font-bold text-sm px-6 py-2.5 rounded-full mt-2">
                Otwórz Devcord
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
