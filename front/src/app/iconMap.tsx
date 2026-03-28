import type { LucideIcon } from 'lucide-react';
import {
  Zap,
  Code,
  Compass,
  Shield,
  Coffee,
  Radio,
  Headphones,
  Hash,
  Crown,
  Terminal,
  Sparkles,
  Users,
  Server,
  MessageSquare,
  BellRing,
  ListTodo,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  Zap,
  Code,
  Compass,
  Shield,
  Coffee,
  Radio,
  Headphones,
  Hash,
  Crown,
  Terminal,
  Sparkles,
  Users,
  Server,
  MessageSquare,
  BellRing,
  ListTodo,
};

export function iconFromKey(key: string | undefined, fallback: LucideIcon): LucideIcon {
  if (!key) return fallback;
  return ICONS[key] ?? fallback;
}
