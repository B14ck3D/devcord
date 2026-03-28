import type { CSSProperties } from "react";
import { motion } from "framer-motion";

type BurstAsset = {
  src: string;
  alt: string;
  className: string;
  style: CSSProperties;
  y: [number, number, number, number, number];
  x: [number, number, number];
  rotate: [number, number, number];
  duration: number;
  delay: number;
};

const desktopAssets: BurstAsset[] = [
  {
    src: "/1.png",
    alt: "Robot mascot",
    className: "absolute z-20 hidden lg:block",
    style: { top: "5%", left: "-8%", width: 220, transform: "translate3d(0,0,145px) rotate(-7deg)" },
    y: [0, -16, 0, 8, 0],
    x: [0, 6, 0],
    rotate: [-7, -5, -7],
    duration: 5.1,
    delay: 0.2,
  },
  {
    src: "/2.png",
    alt: "API fairy",
    className: "absolute z-10",
    style: { top: "-3%", right: "8%", width: 180, transform: "translate3d(0,0,60px) rotate(8deg)" },
    y: [0, -14, 0, 10, 0],
    x: [0, -4, 0],
    rotate: [8, 11, 8],
    duration: 6.3,
    delay: 0.6,
  },
  {
    src: "/3.png",
    alt: "Controller beast",
    className: "absolute z-20",
    style: { bottom: "2%", right: "-6%", width: 210, transform: "translate3d(0,0,130px) rotate(-12deg)" },
    y: [0, -12, 0, 9, 0],
    x: [0, 8, 0],
    rotate: [-12, -9, -12],
    duration: 4.4,
    delay: 0.1,
  },
  {
    src: "/4.png",
    alt: "Blue orb",
    className: "absolute z-0",
    style: { top: "18%", right: "-4%", width: 130, transform: "translate3d(0,0,-45px)" },
    y: [0, -10, 0, 7, 0],
    x: [0, -6, 0],
    rotate: [0, 4, 0],
    duration: 7.2,
    delay: 0.9,
  },
  {
    src: "/5.png",
    alt: "Green braces",
    className: "absolute z-0 hidden lg:block",
    style: { top: "10%", left: "23%", width: 150, transform: "translate3d(0,0,-60px) rotate(-4deg)" },
    y: [0, -9, 0, 6, 0],
    x: [0, 5, 0],
    rotate: [-4, -2, -4],
    duration: 6.8,
    delay: 1.1,
  },
  {
    src: "/6.png",
    alt: "Controller icon",
    className: "absolute z-10",
    style: { bottom: "5%", left: "1%", width: 170, transform: "translate3d(0,0,75px) rotate(5deg)" },
    y: [0, -15, 0, 11, 0],
    x: [0, -7, 0],
    rotate: [5, 8, 5],
    duration: 3.8,
    delay: 0.5,
  },
  {
    src: "/7.png",
    alt: "CPU chip",
    className: "absolute z-10",
    style: { top: "0%", left: "42%", width: 185, transform: "translate3d(0,0,35px) rotate(-3deg)" },
    y: [0, -11, 0, 9, 0],
    x: [0, 4, 0],
    rotate: [-3, 2, -3],
    duration: 5.7,
    delay: 1.3,
  },
  {
    src: "/8.png",
    alt: "Server module",
    className: "absolute z-0",
    style: { bottom: "-2%", left: "30%", width: 165, transform: "translate3d(0,0,-25px) rotate(-6deg)" },
    y: [0, -13, 0, 7, 0],
    x: [0, 3, 0],
    rotate: [-6, -2, -6],
    duration: 4.9,
    delay: 0.8,
  },
];

const mobileAssets = ["/3.png", "/6.png", "/7.png"];

const AppMockup = () => (
  <div className="relative w-full">
    <div className="relative mx-auto hidden h-[500px] w-full max-w-[620px] items-center justify-center md:flex">
      <div className="absolute inset-0 pointer-events-none" style={{ perspective: "2000px" }}>
        <div className="relative h-full w-full" style={{ transformStyle: "preserve-3d" }}>
          {desktopAssets.map((asset) => (
            <motion.img
              key={asset.src}
              src={asset.src}
              alt={asset.alt}
              className={`${asset.className} pointer-events-none select-none`}
              style={asset.style}
              loading="lazy"
              decoding="async"
              draggable={false}
              animate={{ y: asset.y, x: asset.x, rotate: asset.rotate }}
              transition={{
                duration: asset.duration,
                delay: asset.delay,
                repeat: Infinity,
                repeatType: "mirror",
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="relative z-10 w-full max-w-[450px] overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-primary/20 backdrop-blur-md"
        style={{ transform: "rotateY(-15deg) rotateX(10deg)", transformStyle: "preserve-3d" }}
      >
        <div className="flex items-center gap-2 border-b border-white/10 bg-black/20 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/90" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300/90" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
          <span className="ml-2 text-xs font-semibold tracking-wide text-white/70">Devcord Workspace</span>
        </div>

        <div className="space-y-3 p-5">
          <div className="h-7 w-[55%] rounded-md bg-white/10" />
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-4 space-y-2">
              <div className="h-20 rounded-xl bg-white/10" />
              <div className="h-16 rounded-xl bg-white/5" />
            </div>
            <div className="col-span-8 space-y-2">
              <div className="h-10 rounded-xl bg-white/10" />
              <div className="h-10 rounded-xl bg-white/10" />
              <div className="h-16 rounded-xl bg-white/5" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>

    <div className="relative mx-auto flex w-full max-w-[360px] flex-col items-center gap-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-6 backdrop-blur-md md:hidden">
      <div className="w-full rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="mb-3 h-4 w-24 rounded bg-white/20" />
        <div className="space-y-2">
          <div className="h-3 rounded bg-white/15" />
          <div className="h-3 w-[82%] rounded bg-white/15" />
          <div className="h-3 w-[70%] rounded bg-white/15" />
        </div>
      </div>

      <div className="flex w-full items-center justify-center gap-2">
        {mobileAssets.map((src, index) => (
          <motion.img
            key={src}
            src={src}
            alt="Floating app element"
            className="h-auto w-[30%] max-w-[92px] object-contain"
            loading="lazy"
            decoding="async"
            draggable={false}
            animate={{ y: [0, -7 - index, 0, 5, 0] }}
            transition={{
              duration: 3.2 + index * 1.1,
              delay: index * 0.35,
              repeat: Infinity,
              repeatType: "mirror",
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  </div>
);

export default AppMockup;
