import { describe, expect, it } from "vitest";
import { publish, subscribe } from "./realtime";

describe("live event bus", () => {
  it("delivers company-wide events to everyone and targeted ones only to their user, never across companies", () => {
    const a: any[] = [], b: any[] = [], other: any[] = [];
    const offA = subscribe("c1", "uA", (e) => a.push(e));
    const offB = subscribe("c1", "uB", (e) => b.push(e));
    const offO = subscribe("c2", "uA", (e) => other.push(e));
    publish("c1", null, { type: "invalidate", keys: [["jobs", "j1"]] });
    publish("c1", "uA", { type: "notification", notification: { id: "n", kind: "k", title: "t", body: "", read: false, createdAt: "" } });
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(1);
    expect(b[0].type).toBe("invalidate");
    expect(other).toHaveLength(0);
    offA();
    publish("c1", null, { type: "invalidate", keys: [] });
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    offB(); offO();
  });
});
