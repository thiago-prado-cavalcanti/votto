# Integração com as fontes oficiais (esfera federal)

Como o Votto obtém deputados, senadores, partidos, proposições e votos abertos
das APIs oficiais, e como isso é mantido atualizado em produção.

Referência de arquitetura: `CLAUDE.md` §8.

---

## 1. Visão geral

| Domínio | Câmara dos Deputados | Senado Federal |
| --- | --- | --- |
| Partidos | `GET /partidos` + `GET /partidos/{id}` | `GET /composicao/lista/partidos` |
| Agentes | `GET /deputados` | `GET /senador/lista/atual` |
| Temas | `GET /proposicoes` + `/{id}` + `/{id}/temas` | `GET /processo` + `GET /processo/{id}` |
| Votos | `GET /votacoes` + `/{id}` + `/{id}/votos` | `GET /votacao` |

Bases: `https://dadosabertos.camara.leg.br/api/v2` e
`https://legis.senado.leg.br/dadosabertos`. Ambas são públicas, sem autenticação.

Todo registro importado carrega `(source, externalRef)` e é gravado por *upsert*
nessa chave, então reexecutar uma importação nunca duplica nada. Os identificadores
das casas são de uso interno e **não** são expostos — o público continua vendo
apenas `kid` (`CLAUDE.md` §5).

### Particularidades que moldaram o código

1. **`uriProposicaoObjeto` quase sempre vem nulo** na listagem de votações da
   Câmara. A proposição votada é resolvida pelo `proposicoesAfetadas` do
   endpoint de detalhe.
2. **Só o Plenário tem voto nominal.** Decisões de comissão são simbólicas e
   devolvem `votos: []` (às vezes 404). A varredura é restrita a `idOrgao=180`;
   numa janela de três meses, toda votação com placar nominal era do Plenário.
3. **A Câmara recusa intervalos de datas maiores que 3 meses** em `/votacoes`.
   Qualquer janela maior é fatiada (`dateWindows`).
4. **O serviço `materia/*` do Senado foi descontinuado** (depreciado em
   2025-03-18, desligamento previsto para 2026-02-01, substituto `/processo`).
   A integração usa os serviços atuais `/processo` e `/votacao`.
5. **`processo?numdias=` é limitado a 30 dias** pelo Senado; valores maiores são
   reduzidos em vez de causarem erro.
6. **Um partido existe uma única vez.** O importador do Senado reaproveita o
   registro criado pela Câmara quando a sigla coincide — caso contrário "PT"
   apareceria duas vezes na listagem de partidos.

---

## 2. Urgência e classificação

Nenhuma das casas publica uma "nota de urgência" pronta, mas ambas publicam os
sinais que a compõem. `src/lib/domain/priority.ts` os consolida no campo
`Theme.priority` (0–100), recalculado a cada importação:

| Sinal | Origem | Peso |
| --- | --- | --- |
| Regime de tramitação | Câmara `statusProposicao.regime` | base 25–58 |
| Medida provisória | identificador `MPV` (prazo constitucional) | base 65 |
| Situação — quando não há regime | Senado `situacaoAtual` | base 25–70 |
| Situação — sobre um regime publicado | `descricaoSituacao` | −25 a +25 |
| Recência da última movimentação | `dataHora` / `dataUltimaAtualizacao` | −8 a +10 |

Proposições encerradas (virou lei, arquivada, rejeitada, retirada) são limitadas
a 10 — são histórico, não pauta. As faixas exibidas são `Urgente` (≥80),
`Prioritário` (≥60), `Tramitação normal` (≥30) e `Baixa prioridade`.

Três decisões nasceram da calibração contra a primeira carga real:

- **A base deixa folga de propósito.** Das 42 proposições pautadas no Plenário
  da Câmara, **35 têm algum regime de "Urgência"**. Uma base alta marcaria
  praticamente todo o plenário como urgente e o selo não informaria nada — só
  chega a `Urgente` quem tem regime **e** estágio **e** movimentação recente.
- **As duas casas precisam ser comparáveis.** O Senado não publica regime, então
  cairia sempre no default e nenhum processo dele alcançaria o topo. Quando não
  há regime, o vocabulário da situação vira a base: *incluída em ordem do dia*
  (votação hoje, ~8 processos) pontua como urgência; *pronto para deliberação do
  Plenário* é uma fila de ~540 e pontua como tramitação normal.
- **Sair da casa derruba a pontuação.** 18 das 42 diziam *"Aguardando Apreciação
  pelo Senado Federal"* — a Câmara já votou. Continuavam no topo do ranking;
  agora levam −25.

Retunar os pesos **não** exige reimportar: todos os insumos já são colunas de
`Theme`. `npm run reprioritize -- --dry` mostra a distribuição resultante e
`npm run reprioritize` grava.

A **classificação oficial** é guardada em `Theme.classifications`:

- Câmara: `proposicoes/{id}/temas` → `codTema`, `tema`, `relevancia`
  (`relevancia = 1` marca o assunto principal).
- Senado: `processo.classificacoes` → `descricao` e `descricaoHierarquia`
  (ex.: `Economia e Desenvolvimento / Tributos / Desoneração Fiscal`).

O código numérico da fonte fica só no banco; o DTO expõe rótulo, hierarquia e a
marcação de principal.

Também são guardados: identificador oficial (`PL 3085/2026`), casa de origem,
situação, regime, palavras-chave de indexação, datas de apresentação e de última
movimentação, e o link para a página oficial de tramitação.

---

## 3. Os workers

Dez jobs independentes, registrados em `src/lib/integration/jobs.ts`:

| Job | O que traz | Horário (Brasília) |
| --- | --- | --- |
| `camara:parties` | Partidos com bancada na Câmara | domingo 02:00 |
| `senado:parties` | Partidos com bancada no Senado | domingo 02:20 |
| `camara:agents` | Deputados em exercício | domingo 02:40 |
| `senado:agents` | Senadores em exercício | domingo 03:00 |
| `camara:agenda` | Proposições pautadas no Plenário | domingo 03:15 |
| `senado:agenda` | Processos na ordem do dia / prontos para o Plenário | domingo 03:20 |
| `camara:themes` | Todas as proposições que tramitaram | domingo 03:30 |
| `senado:themes` | Todos os processos atualizados | domingo 05:00 |
| `camara:votes` | Votações nominais + votos | domingo 06:00 |
| `senado:votes` | Votações nominais + votos | domingo 07:00 |

Os pares `*:agenda` e `*:themes` cobrem ângulos diferentes de propósito: o
primeiro traz o punhado de proposições efetivamente pautadas para votação
(barato, alto sinal), o segundo varre tudo que se mexeu na janela (amplo, caro).
O de pauta roda antes, para que o que importa entre mesmo se a varredura ampla
falhar depois.

Janela padrão de busca: **30 dias**. Sete bastariam se nenhuma execução falhasse;
trinta absorvem três ciclos perdidos sem deixar buraco, e reimportar é gratuito
porque tudo é idempotente.

Os jobs são **independentes**: o job de agentes cria o partido que faltar e o de
votos cria o agente que faltar, então rodar fora de ordem perde detalhe (um
partido só com a sigla, até o próximo ciclo) mas nunca corretude.

### Execução

O container `worker` (em `docker-compose.prod.yml`) roda o agendador:

- **Catch-up no boot** — qualquer job sem execução bem-sucedida há mais de 8 dias
  roda imediatamente. Uma implantação nova se popula sozinha.
- **Execução sequencial** — um job por vez, para não abrir rajadas de requisições
  contra as APIs públicas.
- **Isolamento de falha** — um job que falha é registrado e o laço segue.
- **Encerramento gracioso** — SIGTERM interrompe após o job corrente
  (`stop_grace_period: 2m`).

### Trava de execução única

Cada job tem uma linha em `SyncJob` que funciona como *lock*: uma execução só
começa se conseguir reivindicá-la. Isso impede que o worker e um disparo manual
importem a mesma janela ao mesmo tempo — as importações são idempotentes, mas
atualizações concorrentes das contagens do mesmo `Theme` dariam deadlock.

Uma reivindicação com mais de **4 horas** é considerada órfã (processo morto) e
pode ser retomada. Nada se perde: a próxima execução reimporta a mesma janela.

---

## 4. Operação

### Painel

`/admin/sincronizacao` mostra cada job com horário, próxima execução, resultado
da última rodada e um botão para sincronizar na hora, além do histórico das
execuções recentes. É lá que se libera um lock preso.

### Carga histórica (backfill)

Para popular um ambiente novo, `scripts/backfill.ts` roda todos os jobs numa
janela larga, na ordem de dependência:

```bash
npm run backfill                          # 6 meses, modo curado (recomendado)
npm run backfill -- --top 100             # limita a 100 proposições por casa
npm run backfill -- --months 12 --mode=full
npm run backfill -- --source camara --force
```

**Por que o padrão não é "tudo".** Nenhuma das casas publica ranking de
relevância, e o `/proposicoes` da Câmara **ignora** `codSituacao` (mandar um
código inexistente devolve o mesmo resultado). O que existe de concreto é a
pauta do Plenário — e é o que o modo `agenda` lê:

| Modo | O que importa | Custo em 6 meses |
| --- | --- | --- |
| `agenda` (padrão) | Bancada completa + proposições pautadas ou votadas | centenas de requisições, ~10 min |
| `full` | O acima + toda proposição que tramitou | ~25 mil requisições, 1–2 h |

Em 60 dias de Plenário da Câmara: 36 sessões deliberativas, das quais só 10
publicam pauta, somando ~86 proposições (≈20 de política, o resto é
requerimento). No Senado, `siglaSituacao=PRONDEPLEN` devolve ~540 processos
prontos para o Plenário — esse filtro **funciona** no servidor.

`--top N` corta pelas N mais relevantes de cada casa. O ranking usa sinais
disponíveis **antes** de qualquer requisição de detalhe, então um `--top 100`
realmente busca só 100 proposições:

- **Câmara** — quantas vezes a proposição foi pautada, e quão recentemente.
- **Senado** — a própria situação: na ordem do dia > agendada > pronta para o Plenário.

O `--top` é teto, não meta: se a janela tiver menos que N, importa o que houver.

Interromper e rodar de novo é seguro — tudo é idempotente e cada job pega o
próprio lock, então o backfill nunca colide com o worker.

### CLI

```bash
npm run sync all                      # refresh federal completo
npm run sync camara                   # todos os jobs da Câmara
npm run sync camara:votes -- --days 90   # backfill de três meses
npm run sync senado:agents -- --limit 5  # teste rápido
npm run sync camara:themes -- --force    # ignora o lock (só se o dono morreu)
```

Em produção, dentro do container que tem o código-fonte:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm migrate npm run sync camara:votes
```

### Gatilho HTTP

Para um agendador externo (cron de plataforma, pinger, curl durante um
incidente). Requer `CRON_SECRET`; sem ele o endpoint recusa tudo.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://votto.online/api/cron/camara:votes?days=7"
```

Respostas: `200` com os contadores, `409` se o job já está rodando, `401` se o
segredo não confere, `503` se `CRON_SECRET` não está configurado.

### Verificação de contratos

```bash
npm run check:sources
```

Bate nos endpoints reais e confere se todo campo que os importadores leem
continua presente, além de exercitar os helpers de prioridade e agendamento.
**Não toca no banco.** Rode depois de cada deploy e sempre que um job passar a
trazer poucos registros — as duas casas publicam dados abertos sem versionamento
e já mudaram serviços debaixo de nós.

### Mandatos que terminam

Agentes que somem da listagem oficial recebem `inOffice = false` em vez de serem
apagados: os votos deles sustentam o índice de alinhamento e o histórico dos
temas. Listagens e rankings públicos mostram só quem tem mandato hoje.

Uma execução que não devolve ninguém (API fora do ar) **não** aposenta a casa
inteira — a reconciliação exige pelo menos um registro visto.

---

## 5. Login gov.br {#govbr}

`src/lib/auth/govbr.ts` implementa o fluxo *authorization code* com PKCE contra o
Login Único, incluindo `state` (CSRF), `nonce` (replay), verificação de assinatura
do `id_token` pelo JWKS do emissor e leitura do `/userinfo` (que o gov.br devolve
como JWT assinado, não como JSON).

O CPF chega no claim `sub`, já verificado pelo provedor — é exatamente por isso
que o Votto não coleta nem valida documentos. Dele derivam as três formas
armazenadas (cifrada, HMAC para deduplicação e prefixo de seis dígitos), e só
nome e sobrenome ficam em claro.

### Onboarding (feito por você)

1. Solicitar o cadastro do Votto como serviço no gov.br (Login Único) e obter
   `client_id` / `client_secret` para **staging** e depois para produção.
2. Registrar a `redirect_uri` exata: `https://votto.online/api/auth/govbr/callback`.
   Registrar o cliente com `subject_type = public` — o Votto lê o CPF do claim `sub`, e um
   cadastro `pairwise` devolveria um pseudônimo no lugar dele. Se isso acontecer, o login falha
   com erro claro (`gov.br não retornou um CPF válido no claim sub`) em vez de gravar lixo.
3. Preencher no `.env.production`:
   ```
   GOVBR_MODE="real"
   GOVBR_ISSUER="https://sso.acesso.gov.br"      # staging: sso.staging.acesso.gov.br
   GOVBR_CLIENT_ID="..."
   GOVBR_CLIENT_SECRET="..."
   GOVBR_REDIRECT_URI="https://votto.online/api/auth/govbr/callback"
   ```
4. Validar em staging antes de virar produção.

> **PKCE:** o documento de descoberta do gov.br **não** anuncia
> `code_challenge_methods_supported`, embora a documentação de integração
> descreva PKCE. O envio do desafio fica ligado por padrão (`GOVBR_PKCE=true`) —
> um servidor que ignore o parâmetro não é afetado. Se o cadastro do cliente
> rejeitar, use `GOVBR_PKCE=false`; o fluxo continua protegido por `state` e
> `nonce`.

### Nível de confiabilidade (e os bancos)

`GOVBR_MIN_TRUST` exige um selo mínimo: `bronze`, `prata` ou `ouro` (vazio =
qualquer conta gov.br, que já tem CPF verificado).

**Não existe login direto com banco.** Não há API pública de identidade dos
bancos brasileiros — cada integração exigiria acordo comercial bilateral e
homologação individual. O caminho real para identidade bancária é o próprio
gov.br: validar a conta em um **banco credenciado** é justamente o que concede o
**selo prata**. Portanto:

```
GOVBR_MIN_TRUST="prata"
```

exige, na prática, que o cidadão tenha validado sua identidade em um banco
credenciado (ou por biometria/app gov.br). O login continua sendo feito pelo
gov.br, e a tela de login explica isso ao cidadão.

Se no futuro um banco expuser um IdP OIDC próprio, ele entra como mais um
provedor: `signInCitizen` (`src/lib/auth/citizen-login.ts`) já concentra a regra
de privacidade e não sabe qual provedor a chamou.

---

## 6. Migração do banco

O schema desta integração está em
`docs/migrations/0002_federal_integration.sql` (idêntico à migration Prisma
`prisma/migrations/20260809120000_federal_integration/`). Conforme a regra do
projeto, **quem executa é você**:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate
```

Todas as instruções são idempotentes (`IF NOT EXISTS`), então reexecutar após uma
migração interrompida funciona em vez de falhar com P3009.

Resumo do que muda:

- `Theme` ganha identificação oficial, casa, URL externa, situação, regime de
  urgência, `priority`, classificações, palavras-chave, `inProgress` e datas.
- `Party` ganha líder, site e bancada oficial.
- `PublicAgent` ganha URL do perfil, `inOffice` e legislatura.
- `Vote` ganha `occurredAt` e `sessionRef` (referência interna da votação).
- Nova tabela `SyncJob` (estado + lock dos workers); `ImportRun` ganha `job`.
