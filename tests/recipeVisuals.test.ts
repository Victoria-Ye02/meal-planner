import { IconChefHat, IconFlame, IconSoup } from "@tabler/icons-react";
import { describe, expect, test } from "vitest";

import { pickRecipeVisual } from "@/lib/recipeVisuals";

describe("pickRecipeVisual", () => {
  test("matches a soup-family keyword case-insensitively", () => {
    const visual = pickRecipeVisual("Hearty Chicken Soup");
    expect(visual.icon).toBe(IconSoup);
  });

  test("matches a grilled/flame keyword", () => {
    const visual = pickRecipeVisual("Grilled Salmon Skewers");
    expect(visual.icon).toBe(IconFlame);
  });

  test("falls back to a default icon when no keyword matches", () => {
    const visual = pickRecipeVisual("Mystery Dish");
    expect(visual.icon).toBe(IconChefHat);
  });

  test("every category has a non-empty gradient class string", () => {
    const titles = [
      "Soup",
      "Salad",
      "Grilled Chicken",
      "Banana Bread",
      "Chocolate Cookie",
      "Pizza",
      "Fish Tacos",
      "Beef Stew Alternative",
      "Something Else",
    ];
    for (const title of titles) {
      const visual = pickRecipeVisual(title);
      expect(visual.gradientClassName.length).toBeGreaterThan(0);
    }
  });
});
