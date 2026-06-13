"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Home, ListOrdered, Settings, Shield, Trophy } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GroupNav({
  groupId,
  isAdmin,
  overviewActions,
  predictionActions,
  pendingHref,
  onNavigate
}: {
  groupId: string;
  isAdmin: boolean;
  overviewActions?: ReactNode;
  predictionActions?: ReactNode;
  pendingHref?: string | null;
  onNavigate?: (href: string) => void;
}) {
  const pathname = usePathname();
  const actions =
    pathname === `/groups/${groupId}`
      ? overviewActions
      : pathname === `/groups/${groupId}/predictions`
        ? predictionActions
        : null;
  const links = [
    ["Overview", `/groups/${groupId}`, Home],
    ["Standings", `/groups/${groupId}/standings`, ListOrdered],
    ["Predictions", `/groups/${groupId}/predictions`, Trophy],
    ["Settings", `/groups/${groupId}/settings`, Settings]
  ] as const;

  function beginNavigation(href: string) {
    if (href !== pathname) onNavigate?.(href);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {links.map(([label, href, Icon]) => {
          const active = pathname === href;
          const pending = pendingHref === href;
          return (
            <Button
              key={label}
              asChild
              variant={active || pending ? "default" : "outline"}
              size="sm"
              className={cn(
                (active || pending) &&
                  "bg-[var(--tippa-accent)] text-[var(--tippa-primary)] hover:bg-[var(--tippa-accent)]"
              )}
            >
              <Link href={href} prefetch onClick={() => beginNavigation(href)}>
                <Icon className="h-4 w-4" /> {label}
              </Link>
            </Button>
          );
        })}
        {isAdmin ? (
          <Button
            asChild
            variant={
              pathname === `/groups/${groupId}/admin` ||
              pendingHref === `/groups/${groupId}/admin`
                ? "default"
                : "secondary"
            }
            size="sm"
            className={cn(
              (pathname === `/groups/${groupId}/admin` ||
                pendingHref === `/groups/${groupId}/admin`) &&
                "bg-[var(--tippa-accent)] text-[var(--tippa-primary)] hover:bg-[var(--tippa-accent)]"
            )}
          >
            <Link
              href={`/groups/${groupId}/admin`}
              prefetch
              onClick={() => beginNavigation(`/groups/${groupId}/admin`)}
            >
              <Shield className="h-4 w-4" /> Admin
            </Link>
          </Button>
        ) : null}
      </div>
      {actions ? <div className="flex justify-start sm:justify-end">{actions}</div> : null}
    </div>
  );
}
