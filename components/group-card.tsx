"use client";

import Link from "next/link";
import { CalendarClock, Trophy } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "@/components/motion";

export type GroupCardData = {
  id: string;
  name: string;
  prize_mode: string;
  tournaments:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
  nextKickoff?: string | null;
  rank?: number | null;
};

export function GroupCard({ group, index }: { group: GroupCardData; index: number }) {
  const tournament = Array.isArray(group.tournaments)
    ? group.tournaments[0]
    : group.tournaments;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link href={`/groups/${group.id}`}>
        <Card className="h-full overflow-hidden transition-transform hover:-translate-y-1">
          <CardHeader className="poster-pattern">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Badge variant="warm">{tournament?.name ?? "Tournament"}</Badge>
                <CardTitle className="mt-3">{group.name}</CardTitle>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Trophy className="h-5 w-5" />
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-muted p-3 text-sm">
              <span>Prize</span>
              <span className="font-bold capitalize">{group.prize_mode.replace("_", " ")}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              {group.nextKickoff
                ? `Next match ${format(new Date(group.nextKickoff), "MMM d, HH:mm")}`
                : "No synced matches yet"}
            </div>
            <p className="text-sm font-bold">
              {group.rank ? `Your rank: #${group.rank}` : "Leaderboard starts after predictions"}
            </p>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
