/**
 * Máscaras de digitação para os campos que o cidadão preenche a partir de um
 * documento.
 *
 * Progressivas por construção: **formatam o que já foi digitado, sem impedir
 * nada**. O formulário de CPF é um `<form method="post">` que funciona com o
 * JavaScript desligado (CLAUDE.md §5), então a máscara não pode ser a condição
 * para o campo aceitar valor — ela é um enfeite que melhora o campo quando o
 * script chega, e some quando não chega. O servidor continua sendo quem
 * normaliza e valida.
 *
 * Elas descartam tudo que não é dígito em vez de bloquear a tecla: colar
 * "123.456.789-09" de um e-mail tem de funcionar, e bloquear caractere a
 * caractere quebra colagem, autofill e teclado de celular.
 */

/** Só os dígitos, limitados a `max`. */
function digits(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

/** `12345678909` → `123.456.789-09`, formatando enquanto se digita. */
export function maskCpf(value: string): string {
  const d = digits(value, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** `01011990` → `01/01/1990`, formatando enquanto se digita. */
export function maskBirthDate(value: string): string {
  const d = digits(value, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * Aplica uma máscara a um input **não controlado**, preservando o cursor.
 *
 * Sem o cuidado com o cursor, editar o meio do campo joga o caret para o fim a
 * cada tecla — o defeito clássico de máscara, e o que faz corrigir um dígito
 * errado ser pior do que apagar tudo. A conta é simples: quantos dígitos existem
 * antes do caret continua sendo o mesmo número depois de formatar.
 */
export function applyMask(
  input: HTMLInputElement,
  mask: (value: string) => string,
): void {
  const caret = input.selectionStart ?? input.value.length;
  const digitsBefore = input.value.slice(0, caret).replace(/\D/g, "").length;

  input.value = mask(input.value);

  let seen = 0;
  let next = input.value.length;
  for (let i = 0; i < input.value.length; i++) {
    if (/\d/.test(input.value[i])) seen++;
    if (seen === digitsBefore) {
      next = i + 1;
      break;
    }
  }
  if (digitsBefore === 0) next = 0;
  input.setSelectionRange(next, next);
}
