import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

type Phase = 'hidden' | 'peek' | 'wave' | 'descend';

type InstallerSplashProps = {
  autoplay?: boolean;
  onSequenceComplete?: () => void;
};

type Particle = {
  id: string;
  src: string;
  x: number;
  y: number;
  rot: number;
  delay: number;
  scale: number;
};

const golem = '/sparkle/1.png';
const bracket = '/sparkle/5.png';
const gamepad = '/sparkle/6.png';
const soundwave = '/sparkle/7.png';

export default function InstallerSplash({ autoplay = true, onSequenceComplete }: InstallerSplashProps) {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [showRobot, setShowRobot] = useState(false);
  const [showParticles, setShowParticles] = useState(false);

  const particles = useMemo<Particle[]>(
    () => [
      { id: 'p1', src: bracket, x: -180, y: -30, rot: -28, delay: 0, scale: 0.45 },
      { id: 'p2', src: gamepad, x: -130, y: -90, rot: -18, delay: 0.06, scale: 0.55 },
      { id: 'p3', src: soundwave, x: -45, y: -120, rot: -8, delay: 0.11, scale: 0.4 },
      { id: 'p4', src: bracket, x: 35, y: -132, rot: 6, delay: 0.18, scale: 0.5 },
      { id: 'p5', src: gamepad, x: 125, y: -95, rot: 17, delay: 0.23, scale: 0.52 },
      { id: 'p6', src: soundwave, x: 170, y: -45, rot: 25, delay: 0.3, scale: 0.38 },
    ],
    [],
  );

  useEffect(() => {
    if (!autoplay) return;
    setShowRobot(true);
    const t1 = window.setTimeout(() => setPhase('peek'), 120);
    const t2 = window.setTimeout(() => setPhase('wave'), 1200);
    const t3 = window.setTimeout(() => {
      setShowParticles(true);
    }, 1550);
    const t4 = window.setTimeout(() => {
      setShowParticles(false);
      setPhase('descend');
    }, 3450);
    const t5 = window.setTimeout(() => {
      setShowRobot(false);
      setPhase('hidden');
      onSequenceComplete?.();
    }, 4450);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [autoplay, onSequenceComplete]);

  return (
    <div className="installer-splash-zone" aria-hidden>
      <AnimatePresence mode="wait">
        {showRobot ? (
          <motion.div
            key="golem"
            className="golem-stage"
            initial={{ y: 180, opacity: 0 }}
            animate={
              phase === 'peek'
                ? { y: 20, opacity: 1, scale: [1, 1.018, 1], rotate: [0, -0.5, 0] }
                : phase === 'wave'
                  ? { y: 16, opacity: 1, scale: [1, 1.02, 1], rotate: [0, 0.3, 0] }
                  : phase === 'descend'
                    ? { y: 220, opacity: 0.2, scale: 0.98 }
                    : { y: 180, opacity: 0 }
            }
            transition={{ duration: 0.42, ease: 'easeOut' }}
          >
            <div className="golem-root">
              <motion.div
                className="golem-part golem-head"
                animate={phase === 'wave' ? { y: [-2, -8, -2] } : { y: [0, -3, 0] }}
                transition={{ duration: 1.05, repeat: Infinity, ease: 'easeInOut' }}
              >
                <img src={golem} alt="" draggable={false} />
                <div className="golem-face">^_^</div>
              </motion.div>

              <div className="golem-part golem-body">
                <img src={golem} alt="" draggable={false} />
              </div>

              <div className="golem-part golem-arm-left">
                <img src={golem} alt="" draggable={false} />
              </div>

              <motion.div
                className="golem-part golem-arm-right"
                animate={phase === 'wave' ? { rotate: [-14, 18, -14] } : { rotate: [0, 3, 0] }}
                transition={{ duration: phase === 'wave' ? 0.35 : 1.1, repeat: Infinity, ease: 'easeInOut' }}
              >
                <img src={golem} alt="" draggable={false} />
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showParticles ? (
          <div className="golem-particles">
            {particles.map((p) => (
              <motion.img
                key={p.id}
                src={p.src}
                alt=""
                className="particle"
                draggable={false}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.2, rotate: 0 }}
                animate={{ x: p.x, y: p.y, opacity: [0, 1, 1, 0], scale: [0.2, p.scale, p.scale + 0.06, 0.1], rotate: p.rot }}
                exit={{ opacity: 0, scale: 0.1 }}
                transition={{ duration: 1.25, delay: p.delay, ease: 'easeOut' }}
              />
            ))}
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
