"use client";

/**
 * Submit button that reflects the enclosing form's pending state.
 */
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui";

export function SubmitButton({
  children,
  pendingLabel = "Salvando...",
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
