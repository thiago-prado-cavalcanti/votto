/**
 * Admin index — redirect to the dashboard.
 */
import { redirect } from "next/navigation";

export default function AdminIndexPage() {
  redirect("/admin/dashboard");
}
