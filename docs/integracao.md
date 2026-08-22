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

## 5. Login do cidadão {#login}

Duas etapas, porque nenhuma das duas basta sozinha:

1. **Provedor social** (Apple, Google, Meta) prova que a pessoa controla aquela
   conta — e nada sobre quem ela é no Brasil.
2. **Registro oficial de CPF** confirma que o CPF digitado existe, está regular e
   pertence a alguém nascido na data informada.

### Por que não é o gov.br

O Login Único seria a porta certa: entrega o CPF **já verificado** no claim
`sub`, sem que o Votto precise coletar documento nenhum. Mas o credenciamento é
concedido apenas a **instituições públicas em domínio `.gov.br`** — o Votto não
se qualifica. O código do fluxo gov.br foi removido em vez de mantido inerte:
seu callback de simulação criava sessão a partir de um formulário e o modo
padrão era `mock`, o que em produção era um bypass de autenticação esperando
para acontecer.

### O que a verificação garante — e o que não garante

Diga isso em voz alta antes de qualquer decisão de produto:

- **Garante** que o CPF é de uma pessoa real e regular. É o que impede voto com
  número saído de gerador de CPF, que era a preocupação original.
- **Não garante posse.** Quem sabe o CPF e o aniversário de um parente passa.

A escolha é consciente e provisória (CLAUDE.md §5). `User.cpfVerificationSource`
grava qual registro respondeu, então quando existir um vínculo mais forte é
possível saber exatamente quais contas foram criadas sob a regra fraca. O Pix
verificador de R$ 0,01 — que ancoraria a identidade na conta bancária — foi
avaliado e adiado: entrar no app do banco no meio do cadastro derruba a
conversão.

### Fluxo

```
/login
  └─ GET /api/auth/social/{provider}/start
       state + nonce + PKCE em cookies httpOnly → provedor
  └─ callback (GET, ou POST form_post na Apple)
       verifica state, troca o code, valida a assinatura do id_token
       ├─ (provider, sub) já vinculado → sessão de cidadão → /
       └─ conta nova → cookie "pending" assinado → /entrar/cpf
  └─ /entrar/cpf
       CPF + nascimento → validateCpf() → Receita
       └─ ok → User (upsert por cpfHash) + SocialAccount → sessão → /
```

Nada é gravado no banco antes do CPF confirmar. Quem desiste no meio não deixa
linha nenhuma — coleta mínima vale principalmente para quem não terminou.

O cookie `pending` também carrega o contador de tentativas (máx. 5). Cada
tentativa é uma consulta paga ao registro (~R$ 0,24), então o limite protege o
orçamento tanto quanto protege contra força bruta sobre a data de nascimento.

### Onboarding (feito por você)

> **Passo a passo de cliques, com as URLs de cada console:**
> [`docs/login-social-passo-a-passo.md`](login-social-passo-a-passo.md).
> O resumo abaixo é o porquê; o guia é o como.

Cada callback é derivado de `APP_URL` e precisa ser registrado **exatamente**
assim, sem barra no final:

```
{APP_URL}/api/auth/social/google/callback
{APP_URL}/api/auth/social/apple/callback
{APP_URL}/api/auth/social/facebook/callback
```

**Google** — console.cloud.google.com → APIs & Services → Credentials → OAuth
client ID → *Web application*. Preencha `GOOGLE_CLIENT_ID` e
`GOOGLE_CLIENT_SECRET`. É o mais simples dos três e o de maior alcance no
Brasil; comece por ele.

**Apple** — developer.apple.com, conta paga. Crie um **Services ID** (não o App
ID) e uma **Key** com *Sign in with Apple* habilitado; baixe o `.p8` (só é
possível baixar uma vez). Preencha `APPLE_CLIENT_ID` (o Services ID),
`APPLE_TEAM_ID`, `APPLE_KEY_ID` e `APPLE_PRIVATE_KEY`.

Três particularidades da Apple, todas já tratadas no código:

- O `client_secret` é um **JWT ES256** assinado com o `.p8`, gerado a cada troca
  de código (`appleClientSecret`), não uma string fixa.
- A resposta volta como `response_mode=form_post` — um **POST cross-site**. Um
  cookie `SameSite=Lax` não é enviado nesse caso, então os cookies do fluxo da
  Apple são `SameSite=None; Secure`. Isso exige **https**: a Apple recusa
  `http`, inclusive em localhost. Para testar localmente, use um túnel.
- O nome da pessoa vem **uma única vez**, no campo `user` da primeira
  autorização. Não é problema aqui: o nome armazenado é o do registro da
  Receita.

**Meta** — developers.facebook.com → seu app → Facebook Login. Preencha
`FACEBOOK_CLIENT_ID` e `FACEBOOK_CLIENT_SECRET`.

> **Instagram não tem credencial própria.** O botão do Instagram roda o fluxo do
> Facebook Login e a conta é gravada como `FACEBOOK`, o que também evita que
> quem usa os dois botões acabe com duas contas. A Meta desligou a Instagram
> Basic Display API em **04/12/2024**; a substituta ("Instagram API with
> Instagram Login") atende só contas Business/Creator e devolve um `username` —
> nem nome, nem e-mail, nem pessoa. Não existe login de Instagram para conta
> pessoal.

Os endpoints OIDC dos três são fixos no código (`src/lib/auth/social/providers.ts`)
em vez de descobertos: pouparia um round trip no caminho crítico para buscar
três URLs, e a descoberta do Facebook nem publica `token_endpoint`. As chaves de
assinatura continuam rotacionando livremente — o `jose` busca do `jwksUri`.
`npm run check:sources` confere esses endpoints contra os documentos oficiais.

### Registro de CPF

`CPF_VALIDATION_PROVIDER` escolhe o adaptador (`src/lib/identity/validation.ts`):

| Provedor | Custo | Exige | Observação |
| --- | --- | --- | --- |
| `mock` | — | nada | **Aceita qualquer CPF válido.** Só desenvolvimento. |
| `infosimples` | ~R$ 0,24/consulta, franquia R$ 100/mês | token | Automatiza o portal da Receita por requisição. Comece aqui. |
| `serpro` | R$ 0,3557–0,5649/consulta | contrato + e-CNPJ | Canal oficial. Migre quando o volume justificar. |

A regra para admitir qualquer outro provedor está no `.env.example` e é curta:
ele precisa exigir a **data de nascimento como entrada**. Quem devolve o nome a
partir do CPF sozinho não está consultando o portal oficial — está lendo de uma
base armazenada, e integrar isso tornaria o Votto controlador de dados de origem
ilícita.

> Deixar `mock` em produção significa que nenhuma conta está verificada e a
> garantia de um voto por cidadão não existe — silenciosamente. É o erro de
> configuração mais caro possível aqui.

### E os bancos

**Não existe login direto com banco.** Não há API pública de identidade dos
bancos brasileiros — cada integração exigiria acordo comercial bilateral. O
caminho que existia era o gov.br (validar a conta em banco credenciado concede o
selo prata), e ele está fora. Se um banco expuser um IdP OIDC próprio, ele entra
como mais um `ProviderConfig`: `signInCitizen`
(`src/lib/auth/citizen-login.ts`) concentra a regra de privacidade e não sabe
qual provedor a chamou.

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
