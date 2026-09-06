import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number | null;
  onChange?: (value: number | null) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
}

export function StarRating({ value, onChange, disabled, size = "sm", label }: StarRatingProps) {
  const dim = size === "md" ? "h-6 w-6" : "h-5 w-5";
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={label ?? "Your rating"}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (value ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-label={
              active && value === n
                ? `Clear rating (${n} stars)`
                : `Rate ${n} star${n > 1 ? "s" : ""}`
            }
            aria-pressed={active}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (disabled || !onChange) return;
              onChange(value === n ? null : n);
            }}
            className={cn(
              "rounded-full p-0.5 transition active:scale-90",
              disabled ? "cursor-not-allowed opacity-50" : "hover:scale-110",
            )}
          >
            <Star
              className={cn(dim, active ? "fill-primary text-primary" : "text-muted-foreground/50")}
            />
          </button>
        );
      })}
    </div>
  );
}
