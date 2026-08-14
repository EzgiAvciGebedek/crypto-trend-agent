"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Markets" },
  { href: "/competitors", label: "Competitors" },
  { href: "/compare", label: "Compare" },
  { href: "/history", label: "History" },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded-lg px-2.5 py-1.5 transition-colors",
              active
                ? "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 font-medium"
                : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
