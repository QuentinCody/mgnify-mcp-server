import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { detectArrays, inferSchema, materializeSchema } from "@bio-mcp/shared/staging/schema-inference";
vi.mock("@bio-mcp/shared/staging/rest-staging-do", () => ({ RestStagingDO: class {} }));
import { MgnifyDataDO } from "./do";

it("materializes protein search rows and preserves fragment flags", () => {
  const payload = { data: [{ mgyp: "MGYP000000000001", full_length: false, cluster_size: 10 }, { mgyp: "MGYP000000000002", full_length: true, cluster_size: 0 }], complete: false, _mgnify_proteins: {} };
  // SAFETY: invoke the pure projection without constructing a Worker DO.
  const projected = (MgnifyDataDO.prototype as unknown as { getTabularData: (data: unknown) => unknown }).getTabularData(payload);
  const arrays = detectArrays(projected);
  const schema = inferSchema(arrays);
  const database = new DatabaseSync(":memory:");
  try {
    const result = materializeSchema(schema, new Map(arrays.map(array => [array.key, array.rows])), {
      exec: (query, ...bindings) => database.prepare(query).run(...bindings as SQLInputValue[]),
    });
    expect(result.failedRows).toBe(0);
    expect(database.prepare("SELECT mgyp, full_length, cluster_size FROM proteins ORDER BY mgyp").all()).toEqual([
      { mgyp: "MGYP000000000001", full_length: 0, cluster_size: 10 },
      { mgyp: "MGYP000000000002", full_length: 1, cluster_size: 0 },
    ]);
  } finally { database.close(); }
});
