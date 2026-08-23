# Índice de Posicionamento — metodologia

> Edição **2026.1** · 23 de agosto de 2026 · `POSITIONING_METHODOLOGY` em
> [`src/lib/indexes/positioning.ts`](../src/lib/indexes/positioning.ts)

Este documento é a fonte de verdade do índice. A página [`/sobre`](../src/app/\(public\)/sobre/page.tsx)
conta a mesma história para quem não vai abrir código; aqui estão as fórmulas, os
limiares, as fontes e — a parte que mais importa — **o que o índice se recusa a
dizer**.

---

## 0. O que mudou, e por quê

A versão anterior calculava, por eixo, uma média ponderada de `voto × peso do
tema` normalizada pela soma dos pesos. Ela é aritmeticamente idêntica ao teste
aberto **8values**, que publica o código-fonte e nenhum método — e falhava por
quatro motivos independentes.

| Defeito | Sintoma | O que corrige |
|---|---|---|
| Ausência de dado lida como centro | `ecoW === 0` → `economic: 0`, a coordenada de um centrista perfeito | cobertura medida, `null` abaixo do piso (§3) |
| Todo tema pesava igual | uma votação 97×3 movia a média como uma 50×50 | peso por discriminação (§2.2) |
| Eixo 1 no Brasil é governo↔oposição | PSOL lido à direita do PSDB | desconto da pauta do Executivo + teste de falseamento (§2.3, §5.2) |
| `0,7·econômico + 0,3·social` | pesos sem fonte | colapso removido; se um número único voltar, será **ajustado** contra âncora (§6) |

---

## 1. O que o índice mede

Onde a trajetória de votos de uma pessoa — parlamentar ou cidadão — cai em dois
eixos de valor. As definições são as do **Chapel Hill Expert Survey**, traduzidas
e não adaptadas, porque usar a operacionalização de outra gente é o que torna o
resultado conferível contra ela em vez de contra si mesmo.

**Eixo econômico — Estado ↔ Mercado.** *"Privatização, impostos, regulação, gasto
público e previdência. O polo Estado quer o poder público atuando na economia; o
polo Mercado quer esse papel reduzido."* (CHES `lrecon`.)

**Eixo social — Ordem ↔ Liberdades.** *"De um lado, ordem, tradição e autoridade
moral do Estado sobre condutas; do outro, liberdades pessoais e autonomia."*
(CHES `galtan`.)

> **O eixo social mudou de rótulo, não de sinal.** Ele era `Comunidade ↔
> Indivíduo`. "Comunidade" convida a codificar comunitarismo, que é uma terceira
> coisa e não correlaciona com nenhum dos dois polos que o eixo mede. As
> classificações já gravadas continuam válidas.

---

## 2. A conta

### 2.1 Contribuição de um voto

Para a pessoa `i`, o eixo `a` e a proposição `j`:

```
sᵢⱼ = sinal(voto)  ×  direção(tagₐⱼ)        voto ∈ {SIM: +1, NÃO: −1}
```

**Abstenção não move nada.** É a regra de todo VAA sério do lado do usuário, e do
lado do parlamentar é ainda mais clara: abstenção e obstrução são manobras
regimentais sob orientação de bancada, não posições sobre o mérito.

### 2.2 Peso de um item

```
wᵢⱼ = discriminação(j) × (1 − contaminação(j)) × confiança(tagₐⱼ) × magnitude(tagₐⱼ)
```

Quatro fatores multiplicados, porque qualquer um deles em zero torna o item
inútil.

**Discriminação** — `2·min(sim, não) / (sim + não)`, sobre os votos dos
parlamentares. Zero numa votação unânime, um numa dividida ao meio. É o
parâmetro de discriminação da Teoria de Resposta ao Item reduzido ao que se mede
sem ajustar modelo, e é o que impede a **composição da pauta** de virar posição:
uma sequência de projetos aprovados por aclamação e marcados no mesmo polo
empurrava, antes, a casa inteira para lá. Itens abaixo de `0,20` (placar 90×10)
saem: medido na Câmara de 2025, isso é **25% das votações nominais**.

> Note a assimetria proposital com o índice de **alinhamento**, que mantém as
> votações unânimes. Concordar com um consenso continua sendo concordância;
> posicionamento é sobre o que separa as pessoas, e uma votação sem linha de
> corte não separa ninguém.

**Contaminação** — `|corr(voto, governismo)|` entre os agentes que votaram
naquela proposição. Mede o quanto a votação foi decidida ao longo da linha
governo↔oposição. `null` quando não se sabe, que é diferente de zero.

### 2.3 A leitura

```
posiçãoᵢₐ = Σⱼ wᵢⱼ·sᵢⱼ / Σⱼ wᵢⱼ            ∈ [−1, 1] → ×100
cobertura  = Σⱼ wᵢⱼ                        ("itens efetivos")
```

**Erro padrão** pela contagem efetiva de Kish — com pesos iguais reduz ao
familiar `s/√n`; com pesos desiguais reconhece que um item que pesa dez vezes
mais não são dez observações.

**Influência** — deixa-um-projeto-de-fora sobre todos os itens, guardando o maior
deslocamento e qual proposição o causou. Se um projeto move o número em quinze
pontos, o número é um relatório sobre aquele projeto, e a página diz isso.

---

## 3. Quando o índice se cala

| Regra | Limiar | Onde |
|---|---|---|
| Cobertura mínima por eixo | 4 itens efetivos | `MIN_EFFECTIVE_ITEMS` |
| Discriminação mínima de um item | 0,20 | `MIN_DISCRIMINATION` |
| Confiança mínima de uma tag | 0,35 | `MIN_AXIS_CONFIDENCE` |
| Itens classificados por casa | 20 | `MIN_HOUSE_ITEMS` |
| Agentes medidos por casa | 30 | `MIN_HOUSE_AGENTS` |
| Correlação com governismo | ≤ 0,50 | `MAX_GOVERNMENT_CORRELATION` |
| Correlação com a âncora externa | ≥ 0,85 | `MIN_ANCHOR_CORRELATION` |
| Cobertura de âncora | ≥ 60% das cadeiras | `MIN_ANCHOR_COVERAGE` |
| Colinearidade dos eixos | ≤ 0,85 para o social virar número | `MAX_AXIS_CORRELATION` |

**Abaixo do piso o eixo é `null`, nunca 0.** Zero, nesses eixos, é a coordenada
de quem está no meio. Publicar zero por falta de dado é publicar uma posição que
ninguém mediu — e é o mecanismo exato pelo qual partidos de posição incontroversa
apareciam no centro.

**O Senado não recebe posicionamento por votação nominal, e a porta é
mecânica.** Ele publicou **14 votações nominais com placar em 18 meses**, mediana
de minoria em 4,1%, 36% delas abaixo do corte de 2,5% que qualquer método
descarta. Catorze não bastam nem para escalar *um* parlamentar — a convenção
consagrada (`wnominate`) é 20 votos por pessoa. A causa é regimental: o RISF art.
293, II estabelece que no processo simbólico *"o voto dos líderes representará o
de seus liderados presentes"*, então na maioria das decisões do Senado os
senadores individualmente não votam.

---

## 4. Classificação das proposições

### 4.1 Formato da tag

```jsonc
{
  "version": 2,
  "scoreable": true,
  "reason": null,                   // honorific | procedural | local | budget | apolitical | ambiguous
  "economic": { "direction": -1, "magnitude": 0.8, "confidence": 0.9 },
  "social":   null,
  "salience": 0.7,
  "yesMeans": "...",                // o que um voto SIM faz acontecer
  "evidence": "...",                // trecho da ementa que sustenta o sinal
  "coding":   { "model": "...", "temperature": 0.2, "runs": 1, "consistency": null }
}
```

**Direção e magnitude são campos separados.** O sinal é um julgamento nominal de
três classes, cuja confiabilidade se mede; a magnitude é intervalar e ninguém a
codifica de forma reproduzível. Mikhaylov, Laver & Benoit (*Political Analysis*
20(1), 2012) mediram a codificação fina do Manifesto Project e encontraram κ
entre **0,05 e 0,18** nas categorias mais difíceis: a graduação não sobrevive nem
a codificadores humanos treinados. Um `0,3` num campo só apagava a diferença
entre "levemente pró-mercado" e "possivelmente pró-mercado".

**`yesMeans` é obrigatório e vem antes dos eixos.** Num requerimento de urgência,
SIM significa "pautar", não "apoiar"; num destaque supressivo, SIM significa
"suprimir". Ler o assunto do projeto e ignorar a pergunta da votação inverte o
sinal numa minoria grande dos casos.

### 4.2 Exclusões — censo com filtro, nunca curadoria

A partir do momento em que um comitê humano escolhe quais projetos contam, a
plataforma passa a ter uma ideologia. O Ranking dos Políticos é honesto ao
declarar a sua ("não somos imparciais"); o Votto não pode declarar nenhuma. Por
isso todo filtro é **mecânico e publicado**.

Snyder (*LSQ* 17(3), 1992) mostrou o preço da alternativa: escolher só votações
divisivas fabrica bimodalidade, e o *scorecard* passa a medir a escolha do
comitê. Poole & Rosenthal registram o efeito nos *scorecards* americanos —
"amontoam muitos legisladores nos extremos 0 e 100".

Incidências medidas ao vivo nas APIs oficiais:

| Filtro | Incidência |
|---|---|
| `codTema 72` — Homenagens e Datas Comemorativas (Câmara) | 5,0% das PLs de 2025 |
| Hierarquia `Honorífico` (Senado) | 8 de 285 classificações |
| Votação procedimental por descrição (Câmara, Plenário) | **58,8%** das votações de 2025 |
| Placar ≥ 90×10 | 25% das votações nominais |

**Ausência é dado faltando, não oposição.** ADA e LCV contam falta como voto
contrário; aqui não. O Votto já tem `RollCall`/`AgentService` e trata licença
oficial e presidência de sessão como o índice de qualidade trata.

### 4.3 Classificador

Um modelo barato, temperatura **0,2** — Gilardi, Alizadeh & Kubli (*PNAS*
120(30), 2023) mediram a autoconsistência de um classificador subindo de 91% para
97% ao baixar a temperatura, sem perda de acurácia. A ordem das perguntas é
desagregada (excluir → o que SIM faz → direção → magnitude → confiança), que é a
recomendação de Pangakis, Wolken & Fasching (2023) para julgamentos difíceis.

> **Dívida conhecida: `CODING_RUNS = 1`.** O protocolo abaixo exige duas
> codificações independentes com aceitação apenas onde os sinais coincidem —
> Gunes & Florczak mediram 83% de acurácia na fatia de 65% em que dois modelos
> concordaram. Subir para 2 dobra o custo da passagem de IA sobre centenas de
> proposições, então é decisão de produto. Enquanto for 1, `consistency` fica
> `null` e esta linha existe.

---

## 5. Validação

### 5.1 Âncoras externas

Um índice construído a partir de votos e validado contra os mesmos votos é
circular — a objeção de Jackson & Kingdon (*AJPS* 36, 1992) aos *scorecards*, que
nunca foi respondida. As réguas estão em
[`src/lib/domain/anchors.ts`](../src/lib/domain/anchors.ts).

**Primária — Bolognesi, Ribeiro, Codato & Silva (2025), onda 2022.** 515
cientistas políticos da ABCP posicionando 32 partidos numa reta de 0 a 10 **sem
números visíveis**, para que não ancorassem em rótulos conhecidos. Microdados
abertos: `doi:10.7910/DVN/MFIXKW`. Correlação com a onda de 2018 (respondentes
distintos): 0,978.

**Secundária — Brazilian Legislative Survey, onda 9 (2021).** Power & Zucco.
Mede a mesma população que o Votto mede — parlamentares federais —, com correção
à la Aldrich–McKelvey para o fato de que "5" não significa o mesmo para um
deputado do PSOL e um do PL. `doi:10.7910/DVN/6KVTUV`.

> **Nunca usar autoposicionamento de parlamentar.** A *direita envergonhada* é
> mensurável: membros do DEM se autoposicionavam em 6,38 enquanto os pares
> posicionavam o partido em 8,07.

**Por que 0,85 e não menos.** As medidas de survey brasileiras concordam entre si
de **0,947 a 0,988** (Bolognesi × BLS × PREPPS × V-Party × Global Party Survey). A
única família fora desse consenso é a análise de manifestos: CHES × RILE = 0,575,
CHES-LA × MARPOR = 0,60, e no Brasil ρ entre 0,13 e 0,36. O limiar separa as duas
famílias.

**Partidos sem âncora não entram na correlação, e não são interpolados.** UNIÃO é
a fusão de DEM (+0,431) e PSL (+0,803), então "+0,617" pareceria inofensivo — mas
um valor inventado dentro da régua que valida o índice passaria a validar a
interpolação. (A âncora Bolognesi 2022 cobre UNIÃO diretamente, em 8,49.)

**O teste de regressão nomeado:** PL mede **8,80/10** em Bolognesi 2022 — o
partido mais à direita do Brasil —, **+0,493** no BLS, 8,45 no PREPPS, 9 no CSES.
Qualquer modelo que devolva "Centro" para o PL erra por ~3,8 pontos contra a
melhor referência disponível.

### 5.2 O teste de falseamento

**A primeira dimensão das votações nominais brasileiras é governo↔oposição, não
esquerda↔direita.** Zucco & Lauderdale (*LSQ* 36(3), 2011): *"o que a Figura 1(c)
reporta como a primeira dimensão do W-NOMINATE não é a dimensão ideológica, e sim
a clivagem governo-oposição."* Leoni (*Dados* 45(3), 2002) chegou lá antes:
*"Substitua a palavra 'partido' por 'Executivo' e 'Oposição' e você terá uma
interpretação bastante razoável da primeira dimensão."*

Medido sobre **87 votações nominais da Câmara (jan/2024 – jun/2025)**, o primeiro
componente principal correlaciona **−0,96 com governismo** e **+0,49** com a
escala do BLS, e ordena o PSOL em 14º de 18, à direita do PSDB — porque o PSOL se
opõe ao governo Lula pela esquerda. Nas 15 votações **sem orientação do governo**,
a mesma conta correlaciona **+0,917** com o BLS.

Isso **não** se corrige classificando melhor os temas: o sinal de coalizão está
nos votos, não nas ementas.

O teste: `|corr(eixo econômico, governismo)|` entre os agentes da casa. Acima de
0,50, **nada é publicado**. Sem a orientação do bloco `Governo` importada, o teste
não pode nem rodar — e uma porta que não pode ser aberta é uma porta fechada.

### 5.3 O portão do segundo eixo

**No Brasil os dois eixos praticamente não se separam.** Martínez-Gallardo et al.
(*Party Politics*, 2023) rodaram análise fatorial confirmatória sobre os itens do
CHES: um segundo fator compra **+0,234 de CFI na Europa e +0,045 na América
Latina**, e a correlação entre as duas dimensões latentes é **0,95 lá contra 0,58
aqui**. Nos onze partidos brasileiros do CHES-LA, r(econômico, social) = **0,94**.

O resíduo é real e vale a figura — separa a direita economicamente liberal e
socialmente moderada (PSDB, NOVO) da moral-autoritária (PL, Republicanos, PSC) —
mas é um décimo da variância, carregado por dois partidos. Acima de 0,85 o eixo
social **continua alimentando a figura e deixa de ser publicado como número**.

Uma nuance na direção contrária: o Brasil é o único país latino-americano onde os
especialistas julgam a ideologia sociocultural **mais saliente** que a econômica.
A agenda moral é alta no Brasil; as *posições* dos partidos nela é que são
colineares com as econômicas.

---

## 6. Faixas do espectro

**Nenhuma faixa é publicada hoje.** As portas para que voltem estão em
`bandGate()`:

1. **Cobertura** — o eixo tem leitura.
2. **Validação** — o índice passou em §5.1 e §5.2.
3. **Separação** — o intervalo de 95% cabe **inteiro dentro de uma faixa**.

A terceira é a que faz o trabalho. Com cinco faixas sobre −100..100, cada uma tem
40 pontos; um intervalo que não caiba numa delas significa que o rótulo é
decidido por ruído. Goldstein & Spiegelhalter, sobre tabelas de liga: *"cerca de
dois terços de todas as comparações possíveis não permitem separação."*

Três coisas mais, se a faixa voltar:

- **Cortes não podem ser percentis.** O handbook OECD/JRC (p. 28): *"quando há
  pouca variação nos escores originais, as bandas percentílicas forçam a
  categorização sobre os dados, independentemente da distribuição subjacente."*
  Percentil manufatura uma distribuição uniforme e rotularia um terço de uma casa
  homogênea como "extrema". Isso é legítimo no índice de **qualidade**, cujos
  rótulos são comparativos ("acima da média"); "Esquerda" e "Direita" não são
  comparativos, são uma afirmação sobre o que a pessoa acredita.
- **Os cortes vêm de fora.** Bolognesi publica os seus: extrema esquerda 0–1,5 ·
  esquerda 1,51–3 · centro-esquerda 3,01–4,49 · **centro 4,5–5,5** ·
  centro-direita 5,51–7 · direita 7,01–8,5 · extrema direita 8,51–10.
- **Esperar o centro vazio.** Na onda de 2018, três partidos ocupavam a faixa
  central; **em 2022 ela não tem ninguém**, e o maior vão da reta vai de 4,12 (PV)
  a 6,01 (Solidariedade). Isso é achado publicado, não defeito de calibragem.

**O precedente de governança.** O Reino Unido aboliu a nota-título única do
Ofsted em setembro de 2024 — *"reductive"*, *"low information for parents and high
stakes for schools"* — depois de um inquérito ligar o processo à morte de uma
diretora. Quatro subnotas substituíram a palavra única. E note quem batiza
categoria entre os testes políticos: 8values, Political Compass ("temos política
estrita contra divulgar essa informação"), IDRlabs. Wahl-O-Mat, StemWijzer,
smartvote e Vote Compass publicam número contínuo e ordem, e nenhum deles nomeia
faixa.

---

## 7. Partidos

Um partido não vota. Tudo o que se diz dele vem dos membros, e a escolha do
estimador depende de qual grandeza se afirma: o partido **como ator** (existe um
θ latente, os membros são leituras ruidosas dele), a **tendência central de quem
ocupa as cadeiras** (descritiva, a média *é* a resposta), ou o **partido que o
leitor encontra na próxima votação** (preditiva). O Votto publica a primeira ou a
terceira, e é isso que licencia o encolhimento.

### 7.1 O estimador

```
Nível 0:  yᵢ ~ N(μᵢ, vᵢ)        vᵢ da própria cobertura do membro
Nível 1:  μᵢ ~ N(θⱼ, ψ²)        ψ = dispersão real dentro do partido
Nível 2:  θⱼ ~ N(μ,  τ²)        τ = espalhamento entre partidos
```

Média ponderada pela precisão (`wᵢ = 1/(ψ² + vᵢ)`), depois encolhida:

```
Bⱼ = τ² / (τ² + Var(ȳⱼ))                  confiabilidade
θ̂ⱼ = μ + Bⱼ·(ȳⱼ − μ)
```

Que é a média bayesiana conhecida do IMDb, `θ̂ⱼ = (nⱼ·ȳⱼ + m·μ)/(nⱼ + m)` com
`m = σ²/τ²`. A frase para a página: *todo partido é pontuado como se tivesse mais
`m` membros parados na média da casa; uma bancada de noventa mal os sente, uma de
um é quase só eles.* A diferença para o IMDb é que ali `m` é escolhido e aqui é
**estimado dos dados** (DerSimonian–Laird, aritmética pura, uma passada).

A ponderação por precisão resolve, sem exclusão nenhuma, o parlamentar empossado
no mês passado: o erro padrão dele é grande, o peso é pequeno. Excluir seria uma
escolha a defender; pesar não é.

### 7.2 O problema Clemente, e o limitador

Encolher minimiza o erro **total** maltratando sistematicamente o indivíduo
genuinamente extremo. Efron mostra isso na série que popularizou o método: James–
Stein ganha no agregado e **perde para a média simples em 4 dos 18 jogadores**,
perdendo feio no caso de Roberto Clemente — o melhor rebatedor do grupo, puxado
para a média porque a média é onde quase todo mundo está.

Aqui os extremos genuínos são exatamente os partidos cuja posição é notícia. Por
isso o encolhimento vem com o limitador de Efron & Morris (*limited
translation*): **o deslocamento nunca passa de um erro padrão da média
observada**. Isso limita a injustiça máxima cometida contra um partido nomeado a
uma grandeza que dá para escrever na página — e a média observada é impressa ao
lado da encolhida, sempre.

### 7.3 Uma casa por partido, nomeada

Câmara e Senado votam projetos diferentes. Groseclose, Levitt & Snyder (*APSR*
1999) mostraram que escalas de *scorecard* "esticam e deslocam" entre casas
justamente por isso: **nenhum peso conserta uma diferença de régua**. A leitura
publicada de um partido é a da casa em que ele tem mais membros medidos, e
`positionDetail.house` diz qual. Uma média silenciosa das duas seria a média de
duas réguas diferentes.

### 7.4 Coesão

Índice de concordância de **Hix, Noury & Roland** (*BJPS* 35(1), 2005):

```
AI = [ máx{S,N,A} − ½·((S+N+A) − máx{S,N,A}) ] / (S+N+A)
```

**Não o índice de Rice**, e a diferença importa porque os votos aqui são
sim/não/abstenção. Rice é `|S−N|/(S+N)` e **ignora a abstenção**: uma bancada que
se abstém em bloco — 10 sim, 10 não, 100 abstenções — marca **0,000 em Rice**
("completamente dividida") contra **0,750 no AI**. Abstenção em bloco é
disciplina exibida, não colapso.

**Descontada pelo tamanho da bancada.** Sob voto aleatório puro, o AI esperado é
0,50 para uma bancada de 2 e 0,08 para uma de 90 — publicar coesão crua daria um
ranking dos "partidos mais coesos do Brasil" cuja ordenação é o inverso do
tamanho. É o artefato que Desposato (*BJPS* 35, 2005) mostrou ter sido confundido
com substância na literatura sobre a Constituinte brasileira. O que se publica é
o **excesso sobre o acaso**, e bancada de um não recebe coesão nenhuma.

**A dispersão vem junto da posição.** Um partido em 0 porque seus membros se
concentram em 0 e um partido em 0 porque metade está em −60 e metade em +60 são
fatos opostos com o mesmo número. Imprimir só a média afirma o primeiro. E a
heterogeneidade é enorme na prática: índices de Rice medidos na legislatura atual
vão de **NOVO 100,0 · PSOL 99,4 · PT 97,7** a **PSDB 66,2 · UNIÃO 67,2 · MDB
68,1**. "A posição do partido" é um resumo justo para os primeiros e quase sem
sentido para o *centrão*.

---

## 8. Cidadãos, e a armadilha do espaço conjunto

Os cidadãos votam nos **mesmos temas** que os parlamentares, o que é uma ponte
melhor que a de Bafumi & Herron (*APSR* 104(3), 2010) — eles tiveram de
*perguntar* a respondentes sobre votações nominais; aqui existe o voto real.

**Mas os dois grupos nunca são estimados juntos.** Jessee (*AJPS* 60(4), 2016)
mostrou o que acontece: os parâmetros dos itens passam a ser dominados por quem
for maioria na amostra, e *"à medida que o número de respondentes diminui, os
pontos ideais estimados dos respondentes parecem mais moderados em relação aos
dos senadores"*. Traduzido: a posição publicada de cada parlamentar passaria a
depender da razão entre cidadãos e parlamentares na base — quer dizer, da taxa de
cadastro da plataforma. **Um deputado se moveria porque o Votto ganhou usuários.**

A solução é a de Jessee (*group-based scaling*): os pesos dos itens vêm **só dos
parlamentares**, e o cidadão é projetado dentro do espaço congelado. Na
arquitetura por tags isso é automático — as tags definem os eixos, então nada que
um cidadão vote pode mover a leitura de ninguém.

---

## 9. Governismo

O que o primeiro componente principal realmente mede tem nome, e publicá-lo com o
nome certo é mais honesto do que descontá-lo em silêncio.

```
governismo = votações em que o agente votou com o bloco `Governo` / votações com orientação
```

Regra do Basômetro, deliberadamente dura: só contam as votações em que o
Executivo tomou posição explícita (bancada liberada sai da conta), e qualquer
coisa que não seja coincidência exata — inclusive obstrução e abstenção — conta
como não apoio.

**Não é medida de virtude e nunca pode ser enquadrada como tal.** PSOL a 63% e PL
a 23% opõem-se ao mesmo governo por direções opostas.

É gravado mesmo quando a casa é barrada nas portas: não depende de nenhuma delas
— é uma contagem, não uma inferência — e é justamente o número que explica por que
a casa foi barrada.

---

## 10. Análise de sensibilidade

O handbook OECD/JRC torna obrigatória (Passo 7). O que roda hoje, em
`npm run reposition -- --dry`:

- **V1 — deixa-um-projeto-de-fora**, por agente e por eixo, com a proposição de
  maior influência publicada na página quando passa de 5 pontos;
- **V2 — Δposto por partido** contra as duas âncoras, sinalizado a partir de 4
  posições de deslocamento;
- **V3 — correlação com governismo**, por casa;
- **V4 — colinearidade dos eixos**, por casa;
- **V5 — fatia de faixas separáveis**: com quantos agentes o intervalo de 95%
  cabe dentro de uma única faixa. Enquanto for minoria, publicar faixa é publicar
  ruído com nome.

**Ainda não roda, e deveria:** perturbação dos cortes de faixa (±5 pontos, contar
quantos mudam de faixa), variantes de estimador partidário (média simples ×
ponderada × mediana × encolhida), e *bootstrap* sobre as proposições para um
intervalo que inclua a incerteza da própria pauta.

---

## 11. O que este índice NÃO mede

- **Não mede qualidade nem virtude.** Estar à esquerda ou à direita não é estar
  certo ou errado. Para "esta pessoa está fazendo o trabalho", o índice é outro
  (§3.3).
- **Não mede o que a pessoa pensa** — mede como ela votou nas proposições que
  chegaram a voto nominal. **Só ~7% das decisões do Plenário da Câmara são sobre
  o texto principal de um projeto**, e 82,6% das decisões do Plenário não deixam
  registro individual nenhum (RICD art. 185: o processo simbólico *"será
  utilizado na votação das proposições em geral"*).
- **Não enxerga a agenda moral.** Varredura de todas as 2.157 votações do
  Plenário da Câmara num ano: **aborto 0, drogas 0, armas 0**; gênero/LGBT 2
  (0,1%). O eixo social é medido sobre o que resta.
- **Não é comparável entre casas** sem uma ponte, e nenhuma foi construída.
- **Não sobrevive a uma troca de presidência sem ser reexaminado.** Nos dados de
  Zucco & Lauderdale, a correlação entre a dimensão ideológica e a de
  governo↔oposição vai de **+0,906 sob FHC a −0,468 sob Lula**. O índice precisa
  ser rerodado e revalidado a cada mudança de governo.
- **Não estabelece que o resíduo do eixo social é um eixo.** Ele é um décimo da
  variância carregado por dois partidos.

---

## 12. Como retunar

```bash
npm run reposition -- --dry     # mede, não grava
npm run reposition              # grava
npm run sync metrics:positioning
```

Tudo o que o índice lê já é coluna, então retunar peso ou limiar é um recálculo
sem rede — gêmeo de `requality` e `reprioritize`. **Suba
`POSITIONING_METHODOLOGY.version` a qualquer mudança nos pesos, nos pisos, na
definição dos eixos ou nas portas.** Um número que muda porque a pessoa mudou e um
número que muda porque o método mudou são fatos diferentes.

Reclassificar as proposições, ao contrário, custa rede e dinheiro:
`npm run summarize`.

---

## 13. Fontes

**Escalonamento de votações nominais**
- Zucco & Lauderdale (2011), *LSQ* 36(3):363–396 — a dimensão governo↔oposição. `doi:10.1111/j.1939-9162.2011.00019.x`
- Leoni (2002), *Dados* 45(3):361–386 — W-NOMINATE na Câmara 1991–98. `doi:10.1590/S0011-52582002000300002`
- Leite & Trento (2016), *Leviathan* 12:120–163 — método do Radar Parlamentar, código AGPL. `doi:10.11606/issn.2237-4485.lev.2016.143408`
- Clinton, Jackman & Rivers (2004), *APSR* 98(2):355–370 — TRI de dois parâmetros; peso de item = discriminação.
- Poole (2000), *Political Analysis* 8:211–237 — Optimal Classification.
- Jessee (2016), *AJPS* 60(4):1108–1124 — a armadilha do espaço conjunto e o *group-based scaling*.
- Bafumi & Herron (2010), *APSR* 104(3):519–542 — ponte cidadão↔parlamentar.
- Hix & Noury (2016), *PSRM* 4(2):249–273 — governo↔oposição em 16 legislaturas.

**Âncoras**
- Bolognesi, Ribeiro, Codato & Silva (2025), *Opinião Pública* 31(1):219 — onda 2022. `doi:10.1590/1807-0191202531120`; microdados `doi:10.7910/DVN/MFIXKW`
- Bolognesi, Ribeiro & Codato (2023), *Dados* 66(2) — onda 2018. `doi:10.1590/dados.2023.66.2.303x`
- Zucco & Power (2024), *LAPS* 66(1):178–188 — BLS, nove ondas; dados `doi:10.7910/DVN/6KVTUV`
- Martínez-Gallardo et al. (2023), *Party Politics* — CHES-LA; a AFC de um contra dois fatores. `doi:10.1177/13540688221090604`
- CHES 2024 codebook — as definições de `lrecon` e `galtan`.

**Codificação e classificadores**
- Mikhaylov, Laver & Benoit (2012), *Political Analysis* 20(1):78–91 — κ da codificação fina. `doi:10.1093/pan/mpr047`
- Gilardi, Alizadeh & Kubli (2023), *PNAS* 120(30) — temperatura e autoconsistência. `arXiv:2303.15056`
- Pangakis, Wolken & Fasching (2023) — validação obrigatória, desagregação, consistência. `arXiv:2306.00176`
- Gunes & Florczak (2023) — acordo entre dois modelos como portão. `arXiv:2310.08167`
- Snyder (1992), *LSQ* 17(3):319–345 — extremismo artificial por seleção de votações.
- Grimmer & Stewart (2013), *Political Analysis* 21(3) — "validar, validar, validar".

**Agregação, incerteza e publicação**
- Efron & Hastie, *Computer Age Statistical Inference*, cap. 7 — James–Stein, o problema Clemente, translação limitada.
- Hix, Noury & Roland (2005), *BJPS* 35(1):209–234 — índice de concordância.
- Desposato (2005), *BJPS* 35:731–744 — viés de tamanho no índice de Rice.
- Groseclose, Levitt & Snyder (1999), *APSR* 93(1):33–50 — escalas não comparáveis entre casas.
- Goldstein & Spiegelhalter (1996), *JRSS-A* — tabelas de liga e seus limites.
- OECD/JRC, *Handbook on Constructing Composite Indicators* (2008) — os dez passos; a advertência sobre bandas percentílicas (p. 28).

**Precedentes e contraexemplos**
- Vote Compass — metodologia publicada com equações, e a seção "o que isto **não**
  se propõe a fazer". `files.voxpoplabs.com/votecompass/methodology.pdf`
- Wahl-O-Mat — o modelo de cálculo em uma página, com exemplo resolvido.
- Voteview / DW-NOMINATE — a estatística de ajuste (`number_of_votes`,
  `number_of_errors`) viaja com **cada** estimativa.
- Political Compass — *"temos política estrita contra divulgar essa informação"*.
  O contraexemplo.
- Radar Parlamentar — publicou tudo, inclusive que duas dimensões explicam só
  26–50% da variância. Está fora do ar.
