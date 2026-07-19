import Image from "next/image";
import { cn } from "@/lib/cn";
import styles from "./claudia-orb.module.css";

export function ClaudiaOrb({
  working = false,
  size = "hero",
  className,
}: {
  working?: boolean;
  size?: "hero" | "processing";
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(styles.shell, className)}
      data-active={working}
      data-size={size}
    >
      <span className={styles.halo} />
      <span className={styles.ringSecondary} />
      <span className={styles.ring} />
      <span className={styles.media}>
        {working ? (
          <video autoPlay loop muted playsInline poster="/web-app-manifest-512x512.png">
            <source src="/claudua_animated.mp4" type="video/mp4" />
          </video>
        ) : (
          <Image
            alt=""
            fill
            priority={size === "hero"}
            sizes={size === "hero" ? "(max-width: 1024px) 70vw, 29rem" : "15rem"}
            src="/claudia-bg-free-logo.png"
          />
        )}
      </span>
      <span className={styles.presence} />
    </div>
  );
}

