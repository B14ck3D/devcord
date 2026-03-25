import React from 'react';

export type NickAppearanceFields = {
  nickGlow?: string;
  nickColor?: string;
  name?: string;
};

export type NickAppearance = {
  style: React.CSSProperties;
  className?: string;
};

type NickStyleV2 = {
  v?: number;
  fx?: string;
  g1?: string;
  g2?: string;
  font?: string;
  shadow?: string;
};

function parseV2(glow: string): NickStyleV2 | null {
  if (!glow.startsWith('{')) return null;
  try {
    const j = JSON.parse(glow) as NickStyleV2;
    return j && j.v === 2 && j.fx ? j : null;
  } catch {
    return null;
  }
}

/** Styl nicku na czacie / liście użytkowników — legacy `text-shadow` albo JSON v2 z efektami Nitro. */
export function nickAppearanceFromFields(
  nickGlow: string | undefined,
  nickColor: string | undefined,
  fallbackColor: string,
): NickAppearance {
  const baseColor = nickColor || fallbackColor;
  const glowRaw = nickGlow?.trim() ?? '';
  const v2 = parseV2(glowRaw);
  if (v2) {
    const g1 = v2.g1 || '#00eeff';
    const g2 = v2.g2 || '#ff00aa';
    const font = v2.font;
    const shadow = v2.shadow || `0 0 14px ${g1}77`;

    switch (v2.fx) {
      case 'gradient':
        return {
          className: 'flux-nick-gradient-shift',
          style: {
            fontFamily: font,
            backgroundImage: `linear-gradient(90deg, ${g1}, ${g2}, ${g1})`,
            backgroundSize: '220% auto',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: `drop-shadow(0 0 10px ${g1}88)`,
          },
        };
      case 'gradient_neon':
        return {
          className: 'flux-nick-gradient-shift',
          style: {
            fontFamily: font,
            backgroundImage: `linear-gradient(120deg, ${g1}, #ffffffaa, ${g2}, ${g1})`,
            backgroundSize: '240% auto',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: `drop-shadow(0 0 12px ${g1}aa) drop-shadow(0 0 22px ${g2}99)`,
          },
        };
      case 'neon_pulse':
        return {
          className: 'flux-nick-neon-pulse',
          style: {
            fontFamily: font,
            color: g1,
            ['--flux-neon1' as string]: g1,
            ['--flux-neon2' as string]: g2,
          } as React.CSSProperties,
        };
      case 'shimmer':
        return {
          className: 'flux-nick-shimmer',
          style: {
            fontFamily: font,
            color: g1,
            ['--flux-shimmer1' as string]: g1,
            ['--flux-shimmer2' as string]: g2,
          } as React.CSSProperties,
        };
      case 'double_outline':
        return {
          style: {
            fontFamily: font,
            color: baseColor,
            textShadow: `0 0 1px ${g2}, 0 0 10px ${g1}, 0 0 22px ${g2}99`,
          },
        };
      default:
        return {
          style: {
            fontFamily: font,
            color: g1,
            textShadow: shadow,
          },
        };
    }
  }

  if (!glowRaw || glowRaw === 'none') {
    return { style: { color: baseColor } };
  }
  return { style: { color: baseColor, textShadow: glowRaw } };
}

export function NickLabel(props: {
  user: NickAppearanceFields;
  fallbackColor: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { user, fallbackColor, className, children } = props;
  const text = children ?? user.name ?? '';
  const { style, className: fx } = nickAppearanceFromFields(user.nickGlow, user.nickColor, fallbackColor);
  const cn = [className, fx].filter(Boolean).join(' ');
  return (
    <span className={cn || undefined} style={style}>
      {text}
    </span>
  );
}
