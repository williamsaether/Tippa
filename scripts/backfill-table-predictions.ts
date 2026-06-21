import { createServiceClient } from "@/lib/supabase/server";
import { ensureLockedTablePredictionDefaults } from "@/lib/table-prediction-defaults";
import { recalculateScoresForGroup } from "@/lib/tournaments/sync-scores";

async function main() {
  const service = createServiceClient();
  const { data: groups, error } = await service.from("groups").select("id,name");
  if (error) throw error;

  let inserted = 0;
  const repaired = [];
  for (const group of groups ?? []) {
    const groupInserted = await ensureLockedTablePredictionDefaults(group.id);
    if (groupInserted === 0) continue;
    await recalculateScoresForGroup(group.id);
    inserted += groupInserted;
    repaired.push({ id: group.id, name: group.name, inserted: groupInserted });
  }

  console.log(JSON.stringify({ inserted, repaired }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
