import { Icon, type IconName } from "@/lib/icons";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({ title, icon }: { title: string; icon: IconName }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-6 text-brand" name={icon} />
        </span>
        <p className="font-medium text-lg">{title}</p>
        <p className="text-muted-foreground text-sm">
          Em construção — volte em instantes.
        </p>
      </CardContent>
    </Card>
  );
}
