import { describe, expect, it } from "vitest";
import { buildDefaultTableOrders, type DefaultOrderMatch } from "./table-prediction-order";

function match(overrides: Partial<DefaultOrderMatch>): DefaultOrderMatch {
  return {
    group_name: "Group A",
    home_team_id: "mexico",
    away_team_id: "south-africa",
    home_team_name: "Mexico",
    away_team_name: "South Africa",
    ...overrides
  };
}

describe("buildDefaultTableOrders", () => {
  it("preserves the original UI's first-fixture appearance order", () => {
    const orders = buildDefaultTableOrders([
      match({}),
      match({
        home_team_id: "south-korea",
        away_team_id: "czech-republic",
        home_team_name: "South Korea",
        away_team_name: "Czech Republic"
      }),
      match({ home_team_id: "mexico", away_team_id: "czech-republic" })
    ]);

    expect(orders.get("Group A")?.map((team) => team.id)).toEqual([
      "mexico",
      "south-africa",
      "south-korea",
      "czech-republic"
    ]);
  });
});
