"use client";

import { addMemberToGroup } from "@/app/actions/god";
import { Button } from "@/components/ui/button";

type UserOption = {
  id: string;
  displayName: string;
};

export function GodAddMemberForm({
  groupId,
  users
}: {
  groupId: string;
  users: UserOption[];
}) {
  if (!users.length) {
    return <p className="text-sm text-muted-foreground">All known users are already in this group.</p>;
  }

  return (
    <form action={addMemberToGroup} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
      <input type="hidden" name="groupId" value={groupId} />
      <select
        name="userId"
        className="h-11 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm"
        required
      >
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.displayName}
          </option>
        ))}
      </select>
      <select
        name="role"
        className="h-11 rounded-2xl border border-input bg-background px-4 py-2 text-sm"
        defaultValue="member"
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>
      <Button type="submit" variant="outline">
        Add
      </Button>
    </form>
  );
}
