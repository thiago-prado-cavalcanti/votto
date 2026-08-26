"use client";

/**
 * Primary navigation links for the public header, highlighting the active route.
 *
 * ── O que está na fileira, e o que saiu dela ────────────────────────────────
 *
 * Cinco entradas, e todas são páginas em que o cidadão **faz** alguma coisa:
 * votar, consultar, comparar, ver o próprio retrato. "Sobre" saiu daqui para o
 * rodapé, junto de "Metodologia", pelo motivo que o §2 já dá para a segunda: é a
 * resposta longa a uma pergunta que se faz uma vez, e na fileira ela competia
 * com as páginas por que a pessoa veio. O rodapé já a carregava — a entrada
 * daqui era a cópia, não a original.
 *
 * `account` acrescenta "Você" — o retrato político do cidadão — e ocupa
 * exatamente a vaga que "Sobre" deixou. Só aparece logado, porque deslogado a
 * página não existe: uma entrada de menu que sempre devolve para o login é um
 * beco, e o convite para entrar já é o botão ao lado.
 *
 * **"Você" e não "Conta"**, e é só uma entrada: as duas páginas são vizinhas mas
 * a interessante é a que resume a pessoa politicamente. `/conta` — trocar quem
 * representa você, apagar dados — é ajuste, e fica a um clique de dentro de
 * `/voce`.
 *
 * The row **wraps**. Abaixo do `sm` ela é uma faixa própria sob a masthead, onde
 * as cinco palavras ainda medem perto do limite de uma tela de 360px; numa linha
 * só elas transbordariam o papel ou pediriam um gesto de rolagem que nenhuma
 * outra parte do site pede.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/", label: "Início" },
  { href: "/temas", label: "Temas" },
  { href: "/agentes", label: "Agentes" },
  { href: "/partidos", label: "Partidos" },
];

export function NavLinks({ account = false }: { account?: boolean }) {
  const pathname = usePathname();
  const links = account ? [...LINKS, { href: "/voce", label: "Você" }] : LINKS;
  return (
    <nav className="flex flex-wrap items-center gap-1">
      {links.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              // The active route is marked with an ink rule under the word, not
              // with a tinted pill.
              "px-2.5 py-2 text-sm transition-colors",
              active
                ? "font-medium text-navy-900 underline decoration-navy-900 decoration-2 underline-offset-[7px]"
                : "text-[var(--color-muted)] hover:text-navy-800",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
