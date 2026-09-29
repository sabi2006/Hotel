import { FOOD_TYPE_LABELS } from "@/types";
import type { FoodType } from "@/types";

const BORDER_CLASSES: Record<FoodType, string> = {
  VEG: "border-success text-success",
  NON_VEG: "border-danger text-danger",
  EGG: "border-warning text-warning",
  OTHER: "border-subtle text-subtle",
};

/** The bordered square Indian menus use to mark veg and non-veg. */
export function FoodTypeDot({ foodType, size = "sm" }: { foodType: FoodType; size?: "sm" | "md" }) {
  return (
    <span
      title={FOOD_TYPE_LABELS[foodType]}
      aria-label={FOOD_TYPE_LABELS[foodType]}
      className={[
        "inline-flex shrink-0 items-center justify-center border",
        size === "md" ? "size-5" : "size-4",
        BORDER_CLASSES[foodType],
      ].join(" ")}
    >
      <span className={size === "md" ? "size-2 rounded-full bg-current" : "size-1.5 rounded-full bg-current"} />
    </span>
  );
}
