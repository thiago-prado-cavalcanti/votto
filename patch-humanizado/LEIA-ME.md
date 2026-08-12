# Votto — sistema humanizado (papel & pigmento)

Pacote de substituição para aplicar o novo design system no codebase. São quatro
arquivos; nenhum deles muda a estrutura de dados, as rotas ou os cálculos de índice.

## Instalação

| Arquivo | Destino |
|---|---|
| `globals.css` | `src/app/globals.css` (substitui) |
| `layout-fonts.tsx` | trecho de fontes em `src/app/layout.tsx` |
| `AlignmentRadar.tsx` | `src/components/public/AlignmentRadar.tsx` (novo) |
| `HeroB.tsx` | `src/components/public/HeroB.tsx` (substitui) |

Depois:

```bash
npm run dev
```

Nenhuma dependência nova. O radar é SVG puro com `requestAnimationFrame`.

## O que muda

**Tokens.** Os nomes das variáveis são os mesmos, então todas as classes utilitárias
existentes adotam o novo visual sem renomear nada:

- `navy-*` deixa de ser preto-azulado e passa a ser tinta quente (`#17150f` no 900);
- `colonial-*` vira pinho, quase o mesmo verde institucional, um grau mais quente;
- `accent-*` deixa de ser laranja de tela e passa a terracota `#b4552f`, com ocre
  `#c07f2c` como novo token de grifo;
- `canvas` clareia para `#fcfaf6`, `line` para `#e2ddd0`;
- votos passam a musgo / tijolo / pedra — abstenção continua neutra, como manda o
  comentário original do código;
- `--radius-card` cai de 20px para 4px: papel dobra, não arredonda.

**Tipografia.** Sora ExtraBold sai por completo, inclusive dos números. Newsreader
(serifa de jornal) assume o display em peso **500**; Instrument Sans fica em rótulos,
botões, cabeçalhos de tabela e microcópia. A classe `.vt-num` põe numerais serifados
e tabulares nos índices.

**Superfícies.** As sombras praticamente desaparecem e a estrutura passa a ser fio de
1px em papel quente. Há um grão de papel a 3.5% em multiply sobre o documento inteiro
— é a única decoração do sistema, e substitui as auroras desfocadas e a grade de 56px
das seções escuras.

**Filetes.** `.vt-rule-ink` é a abertura de seção: uma linha de 3px. Não use filete
duplo.

## O radar

`AlignmentRadar` é a marca viva. Seis vértices ligados por curva fechada
Catmull-Rom com jitter determinístico nos pontos de controle — daí a leitura de
pétala desenhada à mão em vez de teia de aranha. Cicla quatro conjuntos de dados e
as três paletas fechadas (escuro → claro → terracota), com atraso de 50ms por
vértice e um respiro permanente de ±1,2%. Respeita `prefers-reduced-motion`.

**Pendência de produto:** os eixos são áreas de política (Sustentabilidade, Saúde,
Educação, Economia, Segurança, Direitos) e hoje o `DATA` do componente é fictício.
Para ligar em dado real é preciso agrupar temas por área e calcular alinhamento por
grupo — o cálculo é o mesmo de `citizenAgentAlignments`, só particionado. Enquanto
isso não existir, o componente serve como ilustração de marca, não como gráfico.

## Ainda não convertidos

O pacote cobre tokens, tipografia e a home. As telas de Temas, Agentes, Partidos e
Login herdam o novo visual pelos tokens, mas foram desenhadas no estudo com
mudanças de layout que este patch não aplica:

- lista de temas como linha de pauta com painel de votação à direita, em vez de
  grade de cartões;
- ranking como tabela com coluna de índice;
- filtros como campos com fio embaixo, sem caixa.

O desenho dessas telas está em `Votto - Site Humanizado.html`.
