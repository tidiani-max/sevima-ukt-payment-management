import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSemesters } from "./semesters.ts";

test("semesters: invoice semesters stay selectable; no duplicates; API order first", () => {
  const known = [{ value: "Ganjil 2026/2027", label: "Odd" }, { value: "Genap 2026/2027", label: "Even" }];
  const merged = mergeSemesters(known, [{ semester: "Genap 2026/2027" }, { semester: "Ganjil 2020/2021" }, { semester: "Ganjil 2020/2021" }]);
  assert.deepEqual(merged.map((s) => s.value), ["Ganjil 2026/2027", "Genap 2026/2027", "Ganjil 2020/2021"]);
  assert.deepEqual(mergeSemesters([], []), []);
});
