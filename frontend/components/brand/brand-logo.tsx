import Image from "next/image";
import ahsoLogo from "../../../shared/logo/ahsologo.png";
import factoryLogo from "../../../shared/logo/factorylogo.png";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
  variant: "ahso" | "factory";
};

const logos = {
  ahso: {
    alt: "AHSO",
    source: ahsoLogo,
  },
  factory: {
    alt: "DRB Vietnam",
    source: factoryLogo,
  },
} as const;

export function BrandLogo({
  className,
  priority = false,
  variant,
}: BrandLogoProps) {
  const logo = logos[variant];

  return (
    <Image
      alt={logo.alt}
      className={cn("select-none object-contain", className)}
      draggable={false}
      priority={priority}
      src={logo.source}
    />
  );
}
