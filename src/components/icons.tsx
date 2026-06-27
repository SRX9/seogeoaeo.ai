/**
 * Dependency-free icon set. Each icon inherits color via `currentColor` and
 * sizes to `size-5` by default; pass `className` to override.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ className, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? "size-5"}
      {...props}
    >
      {children}
    </svg>
  );
}

export function OverviewIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function TopicsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2.5l2.3 6.2L20.5 11l-6.2 2.3L12 19.5l-2.3-6.2L3.5 11l6.2-2.3z" />
    </Icon>
  );
}

export function ArticlesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
      <path d="M14 2v5h5" />
      <path d="M9 9h2M9 13h6M9 17h6" />
    </Icon>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14 4h7M3 4h7M14 4a2 2 0 1 0 0-.01M10 12H3m18 0h-7m0 0a2 2 0 1 0 0-.01M14 20h7M3 20h7m0 0a2 2 0 1 0 0-.01" />
    </Icon>
  );
}

export function ChevronUpDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
    </Icon>
  );
}

export function BoldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 4h7a4 4 0 0 1 0 8H6z" />
      <path d="M6 12h8a4 4 0 0 1 0 8H6z" />
    </Icon>
  );
}

export function ItalicIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 4h-9M14 20H5M15 4 9 20" />
    </Icon>
  );
}

export function InlineCodeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m18 16 4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16" />
    </Icon>
  );
}

export function BulletListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </Icon>
  );
}

export function OrderedListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <path d="M4 6h1v4M4 10h2M6 18H4c.4-1.4 2-1.6 2-3a1 1 0 0 0-2-.6" />
    </Icon>
  );
}

export function QuoteIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 11H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6c0 2-1 3-3 4" />
      <path d="M20 11h-4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v6c0 2-1 3-3 4" />
    </Icon>
  );
}

export function CodeBlockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1" />
      <path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" />
    </Icon>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </Icon>
  );
}

export function CircleCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function CircleAlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="3" />
      <path d="M22 19v-2a4 4 0 0 0-3-3.85M16 4.15A4 4 0 0 1 16 11.85" />
    </Icon>
  );
}

export function TrendingUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M17 7h4v4" />
    </Icon>
  );
}

export function PenIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4M22 5h-4M4 17v2M5 18H3" />
    </Icon>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

export function SgaLogoIcon({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className ?? "size-10"}
      {...props}
    >
      <defs>
        {/* iOS Squircle Background Gradient */}
        <linearGradient id="ios-bg-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1e1e30" />
          <stop offset="100%" stopColor="#0a0a0f" />
        </linearGradient>

        {/* Outer Metallic Chamfered Rim Gradient */}
        <linearGradient id="ios-rim-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.4" />
        </linearGradient>

        {/* Glyphic Holographic SGA Ribbon Gradient */}
        <linearGradient id="ios-glyph-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" /> {/* Royal Indigo */}
          <stop offset="40%" stopColor="#06b6d4" /> {/* Electric Cyan */}
          <stop offset="100%" stopColor="#10b981" /> {/* Mint Green */}
        </linearGradient>

        {/* Ambient Drop Shadow for iOS Squircle Depth */}
        <filter id="ios-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.5" />
        </filter>

        {/* Glow for the Central Symbolic Glyph */}
        <filter id="ios-glyph-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Main iOS App Icon Squircle Container with drop shadow */}
      <rect
        x="6"
        y="6"
        width="88"
        height="82"
        rx="24"
        fill="url(#ios-bg-gradient)"
        filter="url(#ios-shadow)"
      />

      {/* Inner Metallic Bevel / Precise Chamfered Rim */}
      <rect
        x="6.5"
        y="6.5"
        width="87"
        height="81"
        rx="23.5"
        stroke="url(#ios-rim-gradient)"
        strokeWidth="1"
        fill="none"
      />

      {/* Ambient Inner Glow (subtle accent background light) */}
      <circle
        cx="50"
        cy="45"
        r="28"
        fill="#06b6d4"
        className="opacity-15 blur-[12px]"
      />

      {/* The Central Symbolic SGA Monogram Glyph */}
      <g filter="url(#ios-glyph-glow)">
        {/* Main Ribbon S Path */}
        <path
          d="M34 35 C34 26.5, 46 23.5, 52 23.5 C63 23.5, 65 31, 60 37.5 C55 44, 45 44, 40 50.5 C35 57, 37 68.5, 48 68.5 C59 68.5, 66 61.5, 66 54.5"
          stroke="url(#ios-glyph-gradient)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* SEO Search Loop Ring */}
        <circle
          cx="42.5"
          cy="32.5"
          r="5.5"
          stroke="url(#ios-glyph-gradient)"
          strokeWidth="2"
        />

        {/* GEO AI Sparkle in the center of the squircle */}
        <path
          d="M50 42 L51.5 45.5 L55.5 47 L51.5 48.5 L50 52 L48.5 48.5 L44.5 47 L48.5 45.5 Z"
          fill="url(#ios-glyph-gradient)"
        />

        {/* AEO Answer Engine Pointer node at the ending tip */}
        <circle cx="66" cy="54.5" r="4.5" fill="#10b981" />
        <path
          d="M66 54.5 L71 59.5 L69 51.5 Z"
          fill="#10b981"
        />
      </g>

      {/* Premium iOS 3D Gloss / Glass Highlight Overlay */}
      <path
        d="M6 30 C6 16.7, 16.7 6, 30 6 L70 6 C83.3 6, 94 16.7, 94 30 C94 30.5, 80 34, 50 34 C20 34, 6 30.5, 6 30 Z"
        fill="#ffffff"
        className="opacity-[0.06]"
      />
    </svg>
  );
}

export function SgaLogo({ className, iconClassName, ...props }: { className?: string; iconClassName?: string } & IconProps) {
  return (
    <div className={className ?? "flex items-center gap-2.5"}>
      <SgaLogoIcon className={iconClassName ?? "size-9"} {...props} />
      <div className="text-xl font-bold tracking-tight text-foreground bg-clip-text">
        SeoGeoAeo<span className="text-muted font-normal">.ai</span>
      </div>
    </div>
  );
}

