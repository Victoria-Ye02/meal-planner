import {
  IconBread,
  IconChefHat,
  IconCookie,
  IconFish,
  IconFlame,
  IconMeat,
  IconPizza,
  IconSalad,
  IconSoup,
  type Icon,
} from "@tabler/icons-react";

export type RecipeVisual = {
  icon: Icon;
  /** Tailwind gradient classes for the card's decorative header strip. */
  gradientClassName: string;
};

const CATEGORIES: {
  keywords: string[];
  icon: Icon;
  gradientClassName: string;
}[] = [
  {
    keywords: ["soup", "stew", "broth", "chowder", "bisque"],
    icon: IconSoup,
    gradientClassName:
      "bg-gradient-to-br from-[oklch(0.6_0.1_192)] to-[oklch(0.48_0.12_205)]",
  },
  {
    keywords: ["salad", "slaw", "veggie", "vegetable"],
    icon: IconSalad,
    gradientClassName:
      "bg-gradient-to-br from-[oklch(0.62_0.09_175)] to-[oklch(0.5_0.1_185)]",
  },
  {
    keywords: [
      "grill",
      "grilled",
      "roast",
      "roasted",
      "bbq",
      "seared",
      "smoked",
      "spicy",
    ],
    icon: IconFlame,
    gradientClassName:
      "bg-gradient-to-br from-[oklch(0.56_0.13_245)] to-[oklch(0.42_0.15_255)]",
  },
  {
    keywords: ["bread", "toast", "sandwich", "bagel", "muffin", "biscuit"],
    icon: IconBread,
    gradientClassName:
      "bg-gradient-to-br from-[oklch(0.72_0.08_205)] to-[oklch(0.58_0.1_215)]",
  },
  {
    keywords: [
      "cake",
      "cookie",
      "dessert",
      "sweet",
      "chocolate",
      "pudding",
      "pie",
    ],
    icon: IconCookie,
    gradientClassName:
      "bg-gradient-to-br from-[oklch(0.56_0.12_260)] to-[oklch(0.44_0.14_268)]",
  },
  {
    keywords: ["pizza", "flatbread"],
    icon: IconPizza,
    gradientClassName:
      "bg-gradient-to-br from-[oklch(0.54_0.12_185)] to-[oklch(0.42_0.13_195)]",
  },
  {
    keywords: ["fish", "salmon", "shrimp", "seafood", "tuna", "crab"],
    icon: IconFish,
    gradientClassName:
      "bg-gradient-to-br from-[oklch(0.62_0.1_215)] to-[oklch(0.5_0.11_225)]",
  },
  {
    keywords: ["chicken", "beef", "pork", "steak", "meat", "burger", "bacon"],
    icon: IconMeat,
    gradientClassName:
      "bg-gradient-to-br from-[oklch(0.5_0.13_230)] to-[oklch(0.38_0.14_240)]",
  },
];

const DEFAULT_VISUAL: RecipeVisual = {
  icon: IconChefHat,
  gradientClassName:
    "bg-gradient-to-br from-[var(--primary)] to-[var(--accent)]",
};

/**
 * Picks a decorative icon + gradient for a recipe card based on simple
 * keyword matching against its title. No recipe metadata (cuisine, course,
 * etc.) exists in the data model, so this is a best-effort visual cue, not
 * a real classification — falls back to a neutral chef-hat/brand gradient
 * when nothing matches.
 */
export function pickRecipeVisual(title: string): RecipeVisual {
  const lowerTitle = title.toLowerCase();
  for (const category of CATEGORIES) {
    if (category.keywords.some((keyword) => lowerTitle.includes(keyword))) {
      return {
        icon: category.icon,
        gradientClassName: category.gradientClassName,
      };
    }
  }
  return DEFAULT_VISUAL;
}
