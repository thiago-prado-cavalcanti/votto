/**
 * The identity of the data controller, in one place.
 *
 * Three public documents cite it — the privacy policy, the terms of service and
 * the data-deletion instructions — and a controller whose name differs between
 * two of them is worse than no name at all. Import from here; never retype.
 *
 * ⚠️ The first three fields are the only thing in the legal pages that is not
 * derived from the code. Fill them before going live: LGPD art. 41 requires the
 * controller and whoever answers for it to be publicly identifiable.
 */
export const CONTROLLER = {
  /** ⚠️ Razão social do controlador. */
  legalName: "⚠️ preencher: razão social",
  /** ⚠️ CNPJ, ou "pessoa física" enquanto não houver empresa constituída. */
  taxId: "⚠️ preencher: CNPJ",
  /** ⚠️ Confirme que esta caixa existe e é lida. */
  email: "privacidade@votto.online",

  /** Shown as "última atualização" on every legal page. Bump when they change. */
  updatedAt: "21 de agosto de 2026",
  /** Comarca do foro eleito nos Termos. */
  jurisdiction: "São Paulo, SP",
  /** Prazo de resposta a pedidos de titular. LGPD art. 19, II. */
  responseDays: 15,
  /** Idade mínima — voto facultativo no Brasil a partir dos 16. */
  minimumAge: 16,
} as const;
