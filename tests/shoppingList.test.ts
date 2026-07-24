import { describe, expect, test } from "vitest";

import { buildShoppingList } from "@/lib/shoppingList";

describe("buildShoppingList", () => {
  test("merges the same ingredient (same quantity+unit) across two recipes into one summed line", () => {
    const items = buildShoppingList([
      { ingredients: ["2 eggs", "1 cup flour"] },
      { ingredients: ["3 eggs"] },
    ]);

    const eggLine = items.find((item) => item.name === "eggs");
    expect(eggLine).toBeDefined();
    expect(eggLine?.detail).toBe("5");
  });

  test("groups ingredient names case-insensitively and trims whitespace", () => {
    const items = buildShoppingList([
      { ingredients: ["2 Eggs"] },
      { ingredients: ["  3 eggs  "] },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("eggs");
    expect(items[0].detail).toBe("5");
  });

  test("keeps a unit alongside the summed quantity when every occurrence shares that unit", () => {
    const items = buildShoppingList([
      { ingredients: ["1 cup shredded cheese"] },
      { ingredients: ["2 cups shredded cheese"] },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("shredded cheese");
    expect(items[0].detail).toBe("3 cups");
  });

  test("comma-separates quantities instead of summing when units differ", () => {
    const items = buildShoppingList([
      { ingredients: ["1 cup milk"] },
      { ingredients: ["2 tbsp milk"] },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("milk");
    expect(items[0].detail).toBe("1 cup, 2 tbsp");
  });

  test("comma-separates when a quantity can't be parsed as a plain number (e.g. a range)", () => {
    const items = buildShoppingList([
      { ingredients: ["2-3 eggs"] },
      { ingredients: ["1 eggs"] },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].detail).toBe("2-3, 1");
  });

  test("keeps ingredients with no leading quantity as their own group with an empty detail", () => {
    const items = buildShoppingList([
      { ingredients: ["Salt and pepper to taste"] },
      { ingredients: ["salt and pepper to taste"] },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("salt and pepper to taste");
    expect(items[0].detail).toBe("");
  });

  test("keeps distinct ingredient names as separate list items", () => {
    const items = buildShoppingList([
      { ingredients: ["2 eggs", "1 cup flour"] },
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.name).sort()).toEqual(["eggs", "flour"]);
  });

  test("returns an empty list for no recipes", () => {
    expect(buildShoppingList([])).toEqual([]);
  });

  test("ignores recipes with an empty ingredients array", () => {
    expect(buildShoppingList([{ ingredients: [] }])).toEqual([]);
  });

  test("each returned item has a stable, unique id derived from its name", () => {
    const items = buildShoppingList([
      { ingredients: ["2 eggs"] },
      { ingredients: ["1 cup flour"] },
    ]);
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });
});
