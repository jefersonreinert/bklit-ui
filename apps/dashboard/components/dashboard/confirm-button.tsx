"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/lib/icons";

/** Delete button that asks for a second tap before acting. */
export function ConfirmButton({
  onConfirm,
  label = "",
  confirmLabel = "Toque de novo",
}: {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <Button
      aria-label={armed ? confirmLabel : label || "Apagar"}
      onClick={() => {
        if (armed) {
          onConfirm();
        }
        setArmed(!armed);
      }}
      onMouseLeave={() => setArmed(false)}
      size="sm"
      variant={armed ? "destructive" : "ghost"}
    >
      <Icon className="size-4" name="IconTrashCan" />
      {armed ? confirmLabel : label}
    </Button>
  );
}
