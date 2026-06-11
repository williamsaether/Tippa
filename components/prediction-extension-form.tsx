"use client";

import { useMemo, useState } from "react";
import { grantGroupStagePredictionExtension } from "@/app/actions/groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PredictionExtensionForm({
  groupId,
  userId,
  compact = false
}: {
  groupId: string;
  userId?: string;
  compact?: boolean;
}) {
  const [localDeadline, setLocalDeadline] = useState("");
  const expiresAtIso = useMemo(() => {
    if (!localDeadline) return "";
    const date = new Date(localDeadline);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }, [localDeadline]);

  return (
    <form
      action={grantGroupStagePredictionExtension}
      className={compact ? "grid gap-2 sm:grid-cols-[1fr_auto]" : "grid gap-2 sm:grid-cols-[1fr_1fr_auto]"}
    >
      <input type="hidden" name="groupId" value={groupId} />
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      <input type="hidden" name="expiresAtIso" value={expiresAtIso} />
      <Input
        aria-label="Extension deadline"
        type="datetime-local"
        value={localDeadline}
        onChange={(event) => setLocalDeadline(event.target.value)}
        required
      />
      {compact ? null : <Input name="reason" placeholder="Reason" />}
      <Button type="submit" variant="outline" disabled={!expiresAtIso}>
        Extend
      </Button>
    </form>
  );
}
