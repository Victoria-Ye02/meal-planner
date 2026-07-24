export type ShoppingListItem = {
  id: string;
  name: string;
  /**
   * Human-readable quantity summary: a single summed value (with unit, if
   * every occurrence shared one), a comma-separated list of the original
   * quantity phrases when they couldn't be safely combined, or an empty
   * string when no occurrence had a leading quantity at all.
   */
  detail: string;
};

type ParsedIngredient = {
  /** The leading quantity as written (e.g. "2", "1/2", "2-3"), or null if none was found. */
  rawQuantity: string | null;
  /** Parsed numeric value of `rawQuantity`, or null if it isn't a plain number. */
  numericQuantity: number | null;
  /** Canonical form of a recognized unit word (e.g. "cup" and "cups" both become "cups"), or null. */
  unit: string | null;
  /** The unit exactly as written in the source line (e.g. "cup"), or null. */
  originalUnit: string | null;
  /** Everything after the quantity/unit — the ingredient name, normalized for grouping. */
  name: string;
};

/**
 * Maps every recognized unit spelling (singular/plural/abbreviated) to one
 * canonical form, so "1 cup" and "2 cups" are treated as the same unit for
 * grouping/summing instead of comparing the literal words.
 */
const UNIT_ALIASES: Record<string, string> = {
  cup: "cups",
  cups: "cups",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  clove: "cloves",
  cloves: "cloves",
  slice: "slices",
  slices: "slices",
  can: "cans",
  cans: "cans",
  pinch: "pinch",
  dash: "dash",
};

/** Matches a leading quantity like "2", "1/2", "1.5", or "2-3" at the start of a trimmed string. */
const QUANTITY_PATTERN =
  /^([0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?(?:-[0-9]+(?:\.[0-9]+)?)?)\s+(.*)$/;

function parseIngredientLine(line: string): ParsedIngredient {
  const trimmed = line.trim();
  const match = trimmed.match(QUANTITY_PATTERN);

  if (!match) {
    return {
      rawQuantity: null,
      numericQuantity: null,
      unit: null,
      originalUnit: null,
      name: trimmed.toLowerCase(),
    };
  }

  const [, rawQuantity, rest] = match;
  const numericQuantity = /^[0-9]+(\.[0-9]+)?$/.test(rawQuantity)
    ? Number(rawQuantity)
    : null;

  const words = rest.split(/\s+/);
  const firstWord = words[0]?.toLowerCase() ?? "";
  const canonicalUnit = UNIT_ALIASES[firstWord] ?? null;

  return {
    rawQuantity,
    numericQuantity,
    unit: canonicalUnit,
    originalUnit: canonicalUnit ? firstWord : null,
    name: (canonicalUnit ? words.slice(1).join(" ") : rest)
      .trim()
      .toLowerCase(),
  };
}

/**
 * Aggregates the ingredient lists of every recipe currently assigned to a
 * meal plan into a single deduplicated shopping list. Grouping is by
 * normalized (trimmed, lowercased) ingredient name; when every occurrence
 * of a name shares one unit and a plain numeric quantity, those quantities
 * are summed into one line. Otherwise the original quantity phrases are
 * comma-separated rather than guessed at.
 */
export function buildShoppingList(
  recipes: { ingredients: string[] }[],
): ShoppingListItem[] {
  const groups = new Map<string, ParsedIngredient[]>();

  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      const parsed = parseIngredientLine(line);
      const existing = groups.get(parsed.name);
      if (existing) {
        existing.push(parsed);
      } else {
        groups.set(parsed.name, [parsed]);
      }
    }
  }

  const items: ShoppingListItem[] = [];

  for (const [name, occurrences] of groups) {
    const allHaveUnit = occurrences.every(
      (occurrence) => occurrence.unit !== null,
    );
    const sharedUnit = allHaveUnit ? occurrences[0].unit : null;
    const sameUnit =
      sharedUnit !== null &&
      occurrences.every((occurrence) => occurrence.unit === sharedUnit);
    const allNumeric = occurrences.every(
      (occurrence) => occurrence.numericQuantity !== null,
    );

    let detail: string;
    if (occurrences.every((occurrence) => occurrence.rawQuantity === null)) {
      detail = "";
    } else if (sameUnit && allNumeric) {
      const sum = occurrences.reduce(
        (total, occurrence) => total + (occurrence.numericQuantity ?? 0),
        0,
      );
      detail = `${sum} ${sharedUnit}`;
    } else if (allNumeric && occurrences.every((o) => o.unit === null)) {
      const sum = occurrences.reduce(
        (total, occurrence) => total + (occurrence.numericQuantity ?? 0),
        0,
      );
      detail = `${sum}`;
    } else {
      detail = occurrences
        .map((occurrence) =>
          occurrence.rawQuantity === null
            ? null
            : occurrence.originalUnit
              ? `${occurrence.rawQuantity} ${occurrence.originalUnit}`
              : occurrence.rawQuantity,
        )
        .filter((value): value is string => value !== null)
        .join(", ");
    }

    items.push({ id: name, name, detail });
  }

  return items;
}
