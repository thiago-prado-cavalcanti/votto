# Nova marca Votto — pacote de assets

V simétrico: braços de igual comprimento e inclinação espelhada, um caminho contínuo com junção
redonda, cor dividida exatamente no vértice (branco à esquerda, #ff9a2e à direita).
Geometria canônica na grade 40×40: `M10.8 10.6 L20 28.6 L29.2 10.6`, stroke-width 5.8,
linecap/linejoin round, placa `rx="11"` em #133e39.

## Onde substituir em votto.nosync

| Arquivo do pacote | Destino |
|---|---|
| icon.svg | src/app/icon.svg |
| favicon.png | public/favicon.png |
| icon-192.png | public/icon-192.png |
| icon-512.png | public/icon-512.png |
| apple-icon-180.png | public/apple-icon.png |
| opengraph-image.png | src/app/opengraph-image.png |
| logo.svg | asset de marca / kit de imprensa |
| logo-mark-only.svg | uso sobre fundo claro, sem placa |

Atenção: a marca antiga aparece em quatro lugares no código — `src/app/icon.svg`,
`src/components/public/Logo.tsx`, `src/lib/widgets/images.tsx` (função `Mark`, usada nos widgets
embed e nas imagens OG) e `scripts/generate-brand-assets.mjs`. Trocar só os PNGs deixa o produto
inconsistente.

## Arquivos de código a substituir (pasta patch/)

Cole em cima dos originais — só a geometria muda, a estrutura é a mesma:

| patch/ | Destino |
|---|---|
| src-app-icon.svg | src/app/icon.svg |
| src-components-public-Logo.tsx | src/components/public/Logo.tsx |
| src-lib-widgets-images-Mark.tsx | substitui a função `Mark` em src/lib/widgets/images.tsx |
| scripts-generate-brand-assets-markPaths.mjs | substitui a função `markPaths` em scripts/generate-brand-assets.mjs |

Depois de trocar o `markPaths`, rode `node scripts/generate-brand-assets.mjs` — ele regenera
`icon-192`, `icon-512`, `icon-maskable-512`, `favicon.png`, `apple-icon.png` e a
`opengraph-image.png` com a marca nova, mantendo a composição original do share card.
Os PNGs que acompanham este pacote são alternativa caso você prefira não rodar o script
(a `opengraph-image.png` daqui usa uma composição diferente, com headline).

## Componente Logo (JSX)

```jsx
export function Logo({ size = 40, tile = true }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <clipPath id={`l${id}`}><rect x="-20" y="-20" width="40" height="90" /></clipPath>
        <clipPath id={`r${id}`}><rect x="20" y="-20" width="90" height="90" /></clipPath>
      </defs>
      {tile && <rect width="40" height="40" rx="11" fill="#133e39" />}
      <path d="M10.8 10.6 L20 28.6 L29.2 10.6" fill="none" strokeWidth="5.8"
        strokeLinejoin="round" strokeLinecap="round"
        stroke={tile ? "#ffffff" : "#133e39"} clipPath={`url(#l${id})`} />
      <path d="M10.8 10.6 L20 28.6 L29.2 10.6" fill="none" strokeWidth="5.8"
        strokeLinejoin="round" strokeLinecap="round"
        stroke="#ff9a2e" clipPath={`url(#r${id})`} />
    </svg>
  );
}
```

O wordmark não muda: Sora ExtraBold, tracking −0.045em, ponto final em #ff9a2e — **Votto.**
