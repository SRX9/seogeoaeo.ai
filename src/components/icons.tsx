import Image from "next/image";
import type { SVGProps } from "react";
import {
  Activity01Icon,
  Add01Icon,
  Alert02Icon,
  Analytics01Icon,
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowRight02Icon,
  ArrowUp01Icon,
  ArrowUpDownIcon,
  ArrowUpRight03Icon,
  Calendar01Icon,
  Cancel01Icon,
  ChartBarLineIcon,
  ChartUpIcon,
  CheckmarkCircle02Icon,
  CodeSquareIcon,
  CreditCardIcon as HugeCreditCardIcon,
  CursorPointer01Icon,
  DashboardSpeed01Icon,
  DashboardSquare01Icon,
  File02Icon,
  FlashIcon,
  FloppyDiskIcon,
  Globe02Icon,
  HelpCircleIcon,
  InboxIcon as HugeInboxIcon,
  LayerIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  MinusSignIcon,
  Moon02Icon,
  PencilEdit01Icon,
  Plug01Icon,
  QuoteUpIcon,
  Refresh01Icon,
  Search01Icon,
  SearchList01Icon,
  Settings01Icon,
  Shield01Icon,
  SourceCodeIcon,
  Sun03Icon,
  Target02Icon,
  TextBoldIcon,
  TextItalicIcon,
  Tick02Icon,
  ToolsIcon,
  UserCircle02Icon,
  UserGroupIcon,
  WorkflowSquare01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/cn";

type IconProps = Omit<SVGProps<SVGSVGElement>, "ref">;

function iconComponent(icon: IconSvgElement) {
  return function AppIcon({ className, strokeWidth, ...props }: IconProps) {
    const parsedStrokeWidth = typeof strokeWidth === "number" ? strokeWidth : Number(strokeWidth ?? 1.5);
    return (
      <HugeiconsIcon
        icon={icon}
        strokeWidth={Number.isFinite(parsedStrokeWidth) ? parsedStrokeWidth : 1.5}
        aria-hidden={props["aria-label"] ? undefined : true}
        className={className ?? "size-5"}
        {...props}
      />
    );
  };
}

export const OverviewIcon = iconComponent(DashboardSquare01Icon);
export const ClaudiaIcon = iconComponent(UserCircle02Icon);
export const InboxIcon = iconComponent(HugeInboxIcon);
export const WorkshopIcon = iconComponent(ToolsIcon);
export const TopicsIcon = iconComponent(Target02Icon);
export const ArticlesIcon = iconComponent(File02Icon);
export const ActivityIcon = iconComponent(Activity01Icon);
export const SettingsIcon = iconComponent(Settings01Icon);
export const ShieldIcon = iconComponent(Shield01Icon);
export const SaveIcon = iconComponent(FloppyDiskIcon);
export const ChevronUpDownIcon = iconComponent(ArrowUpDownIcon);
export const BoldIcon = iconComponent(TextBoldIcon);
export const ItalicIcon = iconComponent(TextItalicIcon);
export const InlineCodeIcon = iconComponent(SourceCodeIcon);
export const BulletListIcon = iconComponent(LeftToRightListBulletIcon);
export const OrderedListIcon = iconComponent(LeftToRightListNumberIcon);
export const QuoteIcon = iconComponent(QuoteUpIcon);
export const CodeBlockIcon = iconComponent(CodeSquareIcon);
export const LinkIcon = iconComponent(Link01Icon);
export const CircleCheckIcon = iconComponent(CheckmarkCircle02Icon);
export const SunIcon = iconComponent(Sun03Icon);
export const MoonIcon = iconComponent(Moon02Icon);
export const SearchIcon = iconComponent(Search01Icon);
export const GlobeIcon = iconComponent(Globe02Icon);
export const HelpIcon = iconComponent(HelpCircleIcon);
export const UsersIcon = iconComponent(UserGroupIcon);
export const TrendingUpIcon = iconComponent(ChartUpIcon);
export const PenIcon = iconComponent(PencilEdit01Icon);
export const PlusIcon = iconComponent(Add01Icon);
export const ResearchIcon = iconComponent(SearchList01Icon);
export const InsightIcon = iconComponent(Analytics01Icon);
export const AutomationIcon = iconComponent(WorkflowSquare01Icon);
export const ArrowRightIcon = iconComponent(ArrowRight02Icon);
export const ChevronRightIcon = iconComponent(ArrowRight01Icon);
export const GaugeIcon = iconComponent(DashboardSpeed01Icon);
export const PlugIcon = iconComponent(Plug01Icon);
export const LaunchIcon = iconComponent(ArrowUpRight03Icon);
export const RefreshIcon = iconComponent(Refresh01Icon);
export const LayersIcon = iconComponent(LayerIcon);
export const BoltIcon = iconComponent(FlashIcon);
export const CalendarIcon = iconComponent(Calendar01Icon);
export const CreditCardIcon = iconComponent(HugeCreditCardIcon);
export const UserInputIcon = iconComponent(CursorPointer01Icon);
export const ChartBarIcon = iconComponent(ChartBarLineIcon);
export const CheckIcon = iconComponent(Tick02Icon);
export const XIcon = iconComponent(Cancel01Icon);
export const MinusIcon = iconComponent(MinusSignIcon);
export const ArrowUpIcon = iconComponent(ArrowUp01Icon);
export const ArrowDownIcon = iconComponent(ArrowDown01Icon);
export const ArrowLeftIcon = iconComponent(ArrowLeft01Icon);
export const AlertTriangleIcon = iconComponent(Alert02Icon);

export function SgaLogo({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div className={className ?? "flex items-center gap-2.5"}>
      <Image
        alt=""
        className={cn(
          "size-10 shrink-0 object-contain",
          iconClassName,
        )}
        height={40}
        sizes="40px"
        src="/claudia-bg-free-logo.png"
        width={40}
      />
      <div className="font-title text-xl tracking-tight text-foreground">
        Claudia<span className="font-sans text-sm font-normal text-muted"> by seogeoaeo.ai</span>
      </div>
    </div>
  );
}
