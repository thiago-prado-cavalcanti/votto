/**
 * Edit an existing administrator. passwordHash is never selected/rendered.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/PageHeader";
import { AdminForm, type AdminFormValues } from "@/components/admin/AdminForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar administrador" };

export default async function EditAdminPage({
  params,
}: {
  params: Promise<{ kid: string }>;
}) {
  const { kid } = await params;
  const admin = await db.administrator.findUnique({
    where: { kid },
    select: {
      kid: true,
      firstName: true,
      lastName: true,
      email: true,
      mobile: true,
      imageUrl: true,
      role: true,
    },
  });
  if (!admin) notFound();

  const values: AdminFormValues = {
    kid: admin.kid,
    firstName: admin.firstName,
    lastName: admin.lastName,
    email: admin.email,
    mobile: admin.mobile,
    imageUrl: admin.imageUrl,
    role: admin.role,
  };

  return (
    <div>
      <PageHeader title="Editar administrador" description={`${admin.firstName} ${admin.lastName}`} />
      <AdminForm admin={values} />
    </div>
  );
}
