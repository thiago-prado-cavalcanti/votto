# Logos dos partidos

Como as marcas dos partidos são produzidas, e por quê.

## Por que curadas

As fontes oficiais publicam uma logo por partido, mas nenhuma utilizável. A Câmara
serve `internet/Deputado/img/partidos/{SIGLA}.gif`: um GIF de ~120px que, para a
maioria dos partidos, é a sigla em tipografia comum e não a marca do partido. O
Senado não publica logo alguma.

Por isso a marca é nossa. O mapa sigla → arquivo vive em
`src/lib/integration/party-logos.ts` e é aplicado em `upsertParty`, o único ponto
por onde os dois importadores escrevem partidos — reimportar não reinstala o GIF
da fonte. Partido sem entrada no mapa continua usando o que a fonte publicou.

## O pipeline

Original do Commons → recorte → medição da caixa de tinta → normalização de
peso → SVG + PNG.

```
assets/party-logos/<slug>.svg     # original do Commons, intocado
npm run assets:party-logos        # scripts/build-party-logos.mjs
public/logos/partidos/<slug>.svg  # o que o site serve
public/logos/partidos/<slug>.png  # gêmeo raster, para os cartões OG
```

Os originais ficam versionados justamente para que o build seja refazível: ajustar
recorte ou peso é mudar uma constante e rodar o script de novo.

### 1. Recorte — só o símbolo

Boa parte das marcas oficiais é um **lockup de duas faixas**: o símbolo em cima e o
nome do partido embaixo (às vezes com assinatura — "Fé no Brasil!", "A gente
respeita o Brasil"). Num slot limitado essa faixa consome a altura, o símbolo
encolhe, e o nome fica ilegível de todo modo. O build a corta encolhendo o
`viewBox`: muda a janela de visualização, nenhum traço é alterado.

Ao recalibrar, cuidado com descendentes — o "p" de `psd` e de `podemos` desce
abaixo da linha de base e é cortado junto com a legenda se a fração passar do ponto.

### 2. Caixa de tinta — onde a marca realmente começa

O `viewBox` declarado não é uma bounding box: vários arquivos trazem margem vazia
dentro dele (o do Solidariedade era quase toda margem — proporção declarada de
4,34:1 contra 1,67:1 de tinta real). Confiar nele indenta a marca para longe da
coluna em que deveria alinhar e, pior, normaliza o peso sobre ar. O build mede a
caixa rasterizando uma vez e perguntando ao sharp onde acaba a borda transparente.

Detalhe que custou caro: o probe fixa largura e altura **em pixels** na tag raiz
em vez de escalar por `density`, porque alguns desses SVGs declaram a largura em
milímetros — medindo por densidade, o MDB estourava o limite de pixels e o PCdoB
saía com 28px.

### 3. Normalização — mesmo peso óptico

As marcas vão de 1:1 (a estrela do PT) a 7:1 (Rede). Jogadas num mesmo slot com
`object-contain`, a quadrada ocupa toda a altura e a larga vira um fio de 9px: a
mesma lista exibe logos enormes ao lado de logos minúsculas.

O build resolve isso pondo cada marca num **canvas comum de 250×100 (2,5:1)**,
dimensionada para manter a **área constante** — altura ∝ proporção^−0,5, o expoente
em que uma marca 1:1 e uma 7:1 cobrem a mesma quantidade de tinta. Como todas saem
no mesmo canvas, guardam a proporção entre si em qualquer slot da interface.

A marca fica **encostada à esquerda** do canvas e centrada na vertical. À
esquerda porque o canvas é mais largo que a maioria das marcas: centrada, cada
uma sobraria com um vão diferente na frente, e `object-left` no slot alinha o
canvas — não a marca. Todas apareceriam com um recuo próprio, empurradas para a
direita da coluna com que deveriam alinhar (a borda esquerda do avatar, no card
de agente).

O `BASE` fica abaixo do máximo que caberia no canvas de propósito: em tamanho
cheio as marcas competem com o retrato do agente, e o partido é atributo dele,
não seu igual.

> **Os slots da UI devem ser cortados em 2,5:1, com `object-left`.** Um slot
> quadrado desperdiça a normalização — o canvas entra por largura e sobra altura
> vazia — e sem `object-left` a marca desalinha da coluna. Hoje: `h-10 w-24` nos
> cards de partido e de agente e no embed, `h-16 w-40` na página do partido,
> `h-8 w-20` no ranking da home, 200×80 no cartão OG.

### 4. Raster

Um PNG por marca, 512px no maior lado, porque os cartões OG são rasterizados pelo
satori — que desenha PNG/JPEG, não SVG. `partyLogoRaster()` troca `.svg` por `.png`
ao montar o cartão.

## Origem e licença

Todos os originais vêm do **Wikimedia Commons**, onde logos de partidos brasileiros
são hospedadas como marca registrada de uso nominativo / `PD-textlogo`. O uso aqui é
exatamente esse: identificar o partido que a página descreve. A página de descrição,
com autoria e licença exatas, é `https://commons.wikimedia.org/wiki/File:<arquivo>`.

| Sigla | Arquivo | Corte | Arquivo no Commons |
|---|---|---|---|
| AVANTE | `avante.svg` | — | [Avante 70 (Brasil) logo.svg](https://commons.wikimedia.org/wiki/File:Avante_70_%28Brasil%29_logo.svg) |
| CIDADANIA | `cidadania.svg` | — | [Cidadania (Brasil) logo.svg](https://commons.wikimedia.org/wiki/File:Cidadania_%28Brasil%29_logo.svg) |
| DC | `dc.svg` | 48% | [Logomarca Democracia Cristã.svg](https://commons.wikimedia.org/wiki/File:Logomarca_Democracia_Crist%C3%A3.svg) |
| MDB | `mdb.svg` | — | [Movimento Democrático Brasileiro (2017).svg](https://commons.wikimedia.org/wiki/File:Movimento_Democr%C3%A1tico_Brasileiro_%282017%29.svg) |
| MISSAO | `missao.svg` | — | [Partido Missão logo (dark).svg](https://commons.wikimedia.org/wiki/File:Partido_Miss%C3%A3o_logo_%28dark%29.svg) |
| NOVO | `novo.svg` | 34% | [Partido Novo logo (2023).svg](https://commons.wikimedia.org/wiki/File:Partido_Novo_logo_%282023%29.svg) |
| PCDOB | `pcdob.svg` | — | [PCdoB logo (red).svg](https://commons.wikimedia.org/wiki/File:PCdoB_logo_%28red%29.svg) |
| PDT | `pdt.svg` | — | [LogoPDT.svg](https://commons.wikimedia.org/wiki/File:LogoPDT.svg) |
| PL | `pl.svg` | 30% | [Partido Liberal (Brazil) logo.svg](https://commons.wikimedia.org/wiki/File:Partido_Liberal_%28Brazil%29_logo.svg) |
| PODE | `pode.svg` | 12% | [Podemos (Brasil) logo.svg](https://commons.wikimedia.org/wiki/File:Podemos_%28Brasil%29_logo.svg) |
| PP | `pp.svg` | — | [Progressistas logo (simplified).svg](https://commons.wikimedia.org/wiki/File:Progressistas_logo_%28simplified%29.svg) |
| PRD | `prd.svg` | 22% | [Partido Renovação Democrática logo.svg](https://commons.wikimedia.org/wiki/File:Partido_Renova%C3%A7%C3%A3o_Democr%C3%A1tica_logo.svg) |
| PSB | `psb.svg` | — | [Logo of the Brazilian Socialist Party (wordmark color).svg](https://commons.wikimedia.org/wiki/File:Logo_of_the_Brazilian_Socialist_Party_%28wordmark_color%29.svg) |
| PSD | `psd.svg` | 12% | [PSD Brazil logo.svg](https://commons.wikimedia.org/wiki/File:PSD_Brazil_logo.svg) |
| PSDB | `psdb.svg` | — | [Logo of the Brazilian Social Democracy Party (2023).svg](https://commons.wikimedia.org/wiki/File:Logo_of_the_Brazilian_Social_Democracy_Party_%282023%29.svg) |
| PSOL | `psol.svg` | — | [Logo PSOL roxo.svg](https://commons.wikimedia.org/wiki/File:Logo_PSOL_roxo.svg) |
| PT | `pt.svg` | — | [PT (Brazil) logo 2021.svg](https://commons.wikimedia.org/wiki/File:PT_%28Brazil%29_logo_2021.svg) |
| PV | `pv.svg` | — | [PV Logo.svg](https://commons.wikimedia.org/wiki/File:PV_Logo.svg) |
| REDE | `rede.svg` | 20% | [Rede Sustentabilidade logo.svg](https://commons.wikimedia.org/wiki/File:Rede_Sustentabilidade_logo.svg) |
| REPUBLICANOS | `republicanos.svg` | — | [Republicanos (Brazil) wordmark.svg](https://commons.wikimedia.org/wiki/File:Republicanos_%28Brazil%29_wordmark.svg) |
| SOLIDARIEDADE | `solidariedade.svg` | 42% | [Solidariedade 77 (Brasil) logo.svg](https://commons.wikimedia.org/wiki/File:Solidariedade_77_%28Brasil%29_logo.svg) |
| UNIAO | `uniao.svg` | — | [União Brasil logo.svg](https://commons.wikimedia.org/wiki/File:Uni%C3%A3o_Brasil_logo.svg) |

Notas de escolha:

- **PT, Progressistas e PV** entraram por uma variante já compacta publicada no
  Commons (a estrela, a gota "11", o V) em vez de recorte.
- **PCdoB** usa a variante vermelha, a única das quatro que nunca teve legenda.
- **Solidariedade** é o caso em que a regra do símbolo custa mais: isolado, ele é
  um traço de três setas que identifica mal o partido — a palavra é que carregava
  o reconhecimento. Reverter é pôr `solidariedade: 0` no `CROP`.

## Partidos ainda sem logo curada

Os 22 acima são os que têm representação nas duas casas hoje. Um partido novo entra
na página com o GIF da Câmara (ou com o monograma da sigla, se a fonte não publicar
nada) até ganhar seu original em `assets/party-logos/` e sua entrada no mapa. O
SELECT ao final de `docs/migrations/0004_party_logos.sql` lista quais são.
