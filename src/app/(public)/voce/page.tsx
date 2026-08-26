/**
 * `/voce` — o retrato político do cidadão logado.
 *
 * A ficha de um parlamentar responde "quem é esta pessoa"; esta responde a mesma
 * pergunta sobre quem está lendo, com as mesmas ferramentas e a mesma
 * disciplina. É onde moram, em regime permanente, as leituras que o primeiro
 * acesso guiado apresenta uma vez.
 *
 * ── Não há espectro aqui, e a ausência é um resultado ───────────────────────
 *
 * A página não desenha Estado↔Mercado nem Ordem↔Liberdades. Não por falta de
 * dado do lado do cidadão — as respostas dele *são* uma autodeclaração, o mesmo
 * gênero das pesquisas que usamos como régua — mas porque **os parlamentares não
 * podem ser colocados nesses eixos** (§11, três testes independentes). Um plano
 * com o cidadão sozinho é uma bússola com uma agulha e nenhum norte: o valor de
 * um posicionamento está inteiro na comparação, e sem ela a figura vira
 * horóscopo.
 *
 * O que ocupa esse lugar é `citizenGovernismo`, que é comparável com o agente
 * porque é a mesma pergunta contada da mesma maneira — com a ressalva de base
 * que a própria página imprime.
 *
 * ── Tudo aqui é contagem ────────────────────────────────────────────────────
 *
 * Perfil por área, concordância, governismo, seguidos. Nenhuma das quatro estima
 * um traço latente; as quatro contam o que a pessoa fez e imprimem o
 * denominador ao lado. É a regra do §3.3 ("92% · 312 de 340") aplicada ao
 * cidadão.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui";
import { PageIntro } from "@/components/public/Section";
import { AreaRadar, AreaList } from "@/components/public/AreaRadar";
import { AreaInfo } from "@/components/public/AreaInfo";
import {
  CitizenGovernismoInfo,
  FollowsInfo,
  RankingInfo,
} from "@/components/public/CitizenInfo";
import { Bar } from "@/components/ui/Bar";
import { PersonalRanking } from "@/components/public/PersonalRanking";
import { IndexPlate } from "@/components/public/IndexPlate";
import { Reveal } from "@/components/public/motion";
import { db } from "@/lib/db";
import { getCitizenSession } from "@/lib/auth/session";
import {
  CITIZEN_RANK_SIZE,
  citizenAreaProfile,
  citizenGovernismo,
  citizenRanking,
  citizenVoteCount,
  MIN_CITIZEN_GOVERNISMO,
} from "@/lib/domain/citizen";
import { citizenFollows } from "@/lib/domain/follows";
import { agentTypeProseLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Você",
  description:
    "O seu retrato político no Votto: seus temas, quem vota como você e quem representa você.",
  robots: { index: false },
};

export default async function YouPage() {
  const session = await getCitizenSession();
  if (!session) redirect("/login");

  const user = await db.user.findUnique({
    where: { kid: session.userKid },
    select: { id: true, firstName: true, voteVersion: true, onboardedAt: true },
  });
  if (!user) redirect("/login");

  const [votes, profile, governismo, ranking, follows] = await Promise.all([
    citizenVoteCount(user.id),
    citizenAreaProfile(user.id),
    citizenGovernismo(user.id),
    citizenRanking(user.id, user.voteVersion),
    citizenFollows(user.id),
  ]);

  const areasTouched = profile.slices.filter((s) => s.count > 0).length;

  return (
    <>
      <PageIntro
        eyebrow="Sua página"
        title={user.firstName}
        lead={
          votes === 0
            ? "Você ainda não votou. É o voto que faz todo o resto desta página existir."
            : `Este é o retrato que os seus ${votes} ${votes === 1 ? "voto" : "votos"} desenham. Ele fica mais nítido a cada tema que você responde.`
        }
        // A masthead sempre carrega uma figura que existe (§9). Aqui ela é o
        // registro do próprio cidadão — contagem, não leitura —, que é o único
        // número que já existe antes de qualquer índice ser calculável.
        figure={
          <IndexPlate
            caption="O seu registro"
            rows={[
              { label: "Temas votados", value: votes },
              { label: "Áreas alcançadas", value: areasTouched },
              { label: "Quem você acompanha", value: follows.size },
            ]}
          />
        }
      >
        <Link
          href={votes === 0 ? "/comecar" : "/temas"}
          className="inline-flex items-center rounded-card bg-accent-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-600"
        >
          {votes === 0 ? "Começar" : "Votar em mais temas"}
        </Link>
      </PageIntro>

      <Container className="py-10 sm:py-14">
        <div className="grid gap-14 lg:grid-cols-[1fr_23rem] lg:gap-16">
          <div className="min-w-0 space-y-14">
            {/* ── Quem vota como você ────────────────────────────────────── */}
            <Reveal as="section" variant="fade">
              <h2 className="flex items-center text-xl text-navy-900">
                Quem vota como você
                <RankingInfo rankSize={CITIZEN_RANK_SIZE} />
              </h2>
              {/* A régua abre o bloco logo abaixo do título — a mesma abertura de
                  "Quem representa você", "Seus temas" e "Você e o governo". O
                  texto de apoio e as abas vêm depois dela, dentro do bloco que
                  ela abriu. */}
              <div className="mt-4 border-t-2 border-navy-900 pt-4">
                <p className="max-w-[56ch] text-sm leading-relaxed text-[var(--color-muted)]">
                  Os {CITIZEN_RANK_SIZE} mais alinhados de cada natureza,
                  comparando os seus votos com o registro nominal das duas
                  casas, tema a tema. Cada casa é uma conta separada: um projeto
                  da Câmara não diz nada sobre um senador.
                </p>
                <div className="mt-6">
                  <PersonalRanking
                    size={CITIZEN_RANK_SIZE}
                    benches={[
                      {
                        key: "deputados",
                        label: "Deputados",
                        rows: ranking.deputies,
                        avatar: "portrait",
                        empty:
                          "Vote em projetos da Câmara para esta lista aparecer.",
                        hrefAll: "/agentes?type=FEDERAL_DEPUTY",
                      },
                      {
                        key: "senadores",
                        label: "Senadores",
                        rows: ranking.senators,
                        avatar: "portrait",
                        empty:
                          "Vote em projetos do Senado para esta lista aparecer — um projeto da Câmara não conta aqui.",
                        hrefAll: "/agentes?type=SENATOR",
                      },
                      {
                        key: "partidos",
                        label: "Partidos",
                        rows: ranking.parties,
                        avatar: "logo",
                        empty:
                          "Ainda não há parlamentares medidos em número suficiente por partido.",
                        hrefAll: "/partidos",
                      },
                    ]}
                  />
                </div>
              </div>
            </Reveal>

            {/* ── Quem representa você ───────────────────────────────────── */}
            {/*
              Debaixo do ranking, e não na margem, porque é a continuação dele:
              a lista mostra quem vota como você, e a declaração é o passo que
              essa lista existe para provocar. Na margem, a ação ficava a uma
              coluna de distância da leitura que a justifica.
            */}
            <Reveal as="section" variant="fade" delay={60}>
              <h2 className="flex items-center text-xl text-navy-900">
                Quem representa você
                <FollowsInfo />
              </h2>
              <div className="mt-4 max-w-[42rem]">
                <Follows follows={follows} />
              </div>
            </Reveal>
          </div>

          {/* ── Margem ───────────────────────────────────────────────────── */}
          <div className="space-y-14">
            {/* ── Seus temas ─────────────────────────────────────────────── */}
            {/*
              Na margem, e empilhado, exatamente como as placas de área da ficha
              de agente: a coluna tem 23rem, que é a largura para a qual
              `AreaRadar` foi dimensionado. Na coluna principal ele ficava ao
              lado de uma lista de nove linhas e a seção inteira valia uma tela
              de rolagem para dizer o que a margem diz sem custo nenhum.
            */}
            <Reveal as="aside" variant="fade" delay={40}>
              <h2 className="flex items-center text-xl text-navy-900">
                Seus temas
                <AreaInfo kind="agreement" />
              </h2>
              {profile.publishable ? (
                <div className="mt-4 border-t-2 border-navy-900 pt-5">
                  <AreaRadar
                    title={`Áreas em que ${user.firstName} votou`}
                    axes={profile.slices.map((s) => ({
                      key: s.area,
                      label: s.label,
                      value: s.share,
                    }))}
                  />
                  <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
                    Em que áreas você escolheu votar — você escolhe, o
                    parlamentar reage à pauta.
                  </p>
                  <div className="mt-7">
                    <AreaList
                      rows={profile.slices.map((s) => ({
                        key: s.area,
                        label: s.label,
                        value: s.share,
                        note:
                          s.count === 0
                            ? "nenhuma"
                            : `${s.count} de ${profile.total}`,
                      }))}
                    />
                    <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted)]">
                      Uma proposta conta em cada área que toca, então as fatias
                      somam mais de 100%.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 border-t-2 border-navy-900 pt-4 text-sm leading-relaxed text-[var(--color-muted)]">
                  Vote em mais alguns temas para desenhar o seu perfil por área.
                </p>
              )}
            </Reveal>

            <Reveal as="aside" variant="fade" delay={100}>
              <h2 className="flex items-center text-xl text-navy-900">
                Você e o governo
                <CitizenGovernismoInfo floor={MIN_CITIZEN_GOVERNISMO} />
              </h2>
              <div className="mt-4">
                <figure className="mx-0 border-t-2 border-navy-900">
                  <figcaption className="pb-3 pt-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-navy-600">
                    Vota com o governo
                  </figcaption>
                  {governismo ? (
                    <div className="border-t border-line py-4">
                      <div className="vt-num vt-fade text-[2.7rem] leading-none text-navy-900">
                        {governismo.value}%
                      </div>
                      <div className="mt-3">
                        <Bar
                          track="bg-[var(--color-line)]"
                          segments={[
                            {
                              key: "gov",
                              width: governismo.value,
                              className: "bg-navy-900",
                            },
                          ]}
                        />
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">
                        {governismo.value}% dos {governismo.base}{" "}
                        {governismo.base === 1
                          ? "tema que você votou"
                          : "temas que você votou"}{" "}
                        e que tiveram orientação do governo.
                      </p>
                      {/* A ressalva de base, impressa e não escondida: o número
                          do parlamentar tem votações por denominador e este tem
                          temas. São a mesma pergunta, não a mesma conta. */}
                      <p className="mt-3 text-xs leading-relaxed text-[var(--color-muted)]">
                        Mede coincidência com o Executivo,{" "}
                        <strong className="font-medium text-ink">
                          não ideologia
                        </strong>
                        . E não compare direto com o número de um parlamentar: o
                        dele conta votações, o seu conta temas.
                      </p>
                    </div>
                  ) : (
                    <p className="border-t border-line py-4 text-sm leading-relaxed text-[var(--color-muted)]">
                      Você ainda não votou em temas suficientes que tenham tido
                      orientação de bancada do governo.
                    </p>
                  )}
                </figure>
              </div>
            </Reveal>

            {user.onboardedAt ? null : (
              <Reveal as="aside" variant="fade" delay={140}>
                <div className="border-t-2 border-navy-900 pt-4">
                  <p className="text-sm leading-relaxed text-navy-700">
                    Você ainda não viu a apresentação da plataforma.
                  </p>
                  <Link
                    href="/comecar"
                    className="mt-3 inline-flex items-center rounded-card border border-navy-300 px-4 py-2 text-sm font-medium text-navy-800 transition-colors hover:border-navy-600"
                  >
                    Ver agora
                  </Link>
                </div>
              </Reveal>
            )}

            <Reveal as="aside" variant="fade" delay={180}>
              <div className="border-t border-line pt-4 text-xs leading-relaxed text-[var(--color-muted)]">
                Trocar quem representa você, rever o consentimento ou apagar
                seus dados fica em{" "}
                <Link
                  href="/conta"
                  className="font-medium text-navy-700 hover:text-navy-900"
                >
                  Conta
                </Link>
                .
              </div>
            </Reveal>
          </div>
        </div>
      </Container>
    </>
  );
}

function Follows({
  follows,
}: {
  follows: Awaited<ReturnType<typeof citizenFollows>>;
}) {
  const rows = [...follows.entries()];
  if (rows.length === 0) {
    return (
      <div className="border-t-2 border-navy-900 pt-4">
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">
          Você ainda não declarou quem representa você. É o que permite a um
          parlamentar saber se está votando como a sua base pensa.
        </p>
        {/*
          Terracota, e não o contorno em tinta que a ficha do agente usa.
          O §9 reserva a terracota para o voto e manda acompanhar sair de
          contorno — mas ali o botão divide a masthead COM a cédula, e a regra
          existe para ele não competir com ela. Aqui não há cédula na página: o
          bloco é um estado vazio cuja única razão de existir é provocar a
          declaração, e um contorno discreto num bloco que não tem mais nada
          pede para ser ignorado.
        */}
        <Link
          href="/agentes"
          className="mt-4 inline-flex items-center rounded-card bg-accent-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-600"
        >
          Escolher quem representa você
        </Link>
      </div>
    );
  }

  return (
    <figure className="mx-0 border-t-2 border-navy-900">
      {rows.map(([type, agent]) => (
        <div
          key={type}
          className="border-t border-line py-3.5 first:border-t-0"
        >
          <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            {agentTypeProseLabel[type]}
          </div>
          <Link
            href={`/agentes/${agent.kid}`}
            className="mt-1 block font-display text-lg leading-tight text-navy-900 hover:underline"
          >
            {agent.name}
          </Link>
        </div>
      ))}
    </figure>
  );
}
