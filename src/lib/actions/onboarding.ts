"use server";

/**
 * Encerrar o primeiro acesso guiado.
 *
 * Marca `onboardedAt` e leva para a home, onde se vota. O convite para refazer
 * o percurso continua em `/voce` enquanto a marca não existir.
 *
 * Idempotente: marcar duas vezes não muda nada, e a data guardada é a da
 * primeira, que é a que responde "quando ele passou por isto".
 */
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCitizenSession } from "@/lib/auth/session";

export async function completeOnboardingAction(): Promise<void> {
  const session = await getCitizenSession();
  if (!session) redirect("/login");

  await db.user.updateMany({
    where: { kid: session.userKid, onboardedAt: null },
    data: { onboardedAt: new Date() },
  });

  // Para a home, e não para `/voce`.
  //
  // O percurso é uma apresentação: quem chega ao fim dele ainda não votou em
  // nada, então a página pessoal teria todas as leituras vazias — que é
  // exatamente a primeira impressão que o onboarding existe para evitar. A home
  // é onde estão os temas quentes e a ação de votar, que é o que o botão promete.
  redirect("/");
}
