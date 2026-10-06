"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { imageSrc, initialsOf, usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

/** The user's photo (uploaded in Configurações) or their initials. */
export function ProfileAvatar({
  className,
  fallbackClassName,
  name,
  src,
}: {
  className?: string;
  fallbackClassName?: string;
  /** Overrides (e.g. a name being typed or a photo preview). */
  name?: string;
  src?: string | null;
}) {
  const prefs = usePreferences();
  const photo = src === undefined ? imageSrc(prefs, "avatar") : src;
  return (
    <Avatar className={className}>
      {photo ? <AvatarImage alt="" src={photo} /> : null}
      <AvatarFallback
        className={cn(
          "bg-foreground font-medium text-background",
          fallbackClassName
        )}
      >
        {initialsOf(name ?? prefs.name)}
      </AvatarFallback>
    </Avatar>
  );
}
