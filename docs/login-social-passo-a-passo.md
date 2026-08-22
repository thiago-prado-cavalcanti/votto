# Login social — passo a passo

Guia de cliques para cadastrar o Votto no Google, na Meta e na Apple. Cada
provedor é independente: dá para abrir só o Google hoje e os outros depois.

Para **o que** cada coisa faz e por que o fluxo é assim, veja
[integracao.md §5](integracao.md#login). Aqui é só o passo a passo.

> **Nada disso é necessário para desenvolver.** Com `SOCIAL_MODE="mock"` o
> simulador em `/dev-idp` faz o papel dos três, e o fluxo inteiro roda sem
> credencial nenhuma. Siga este guia quando quiser o login de verdade.

---

## Antes de começar

Anote as URLs de retorno. Elas saem do seu `APP_URL` e precisam ser coladas
**exatamente** assim — sem barra no final, sem `www` a mais:

Produção:

```
https://votto.online/api/auth/social/google/callback
https://votto.online/api/auth/social/facebook/callback
https://votto.online/api/auth/social/apple/callback
```

Testando na sua máquina (só Google e Meta — a Apple recusa `localhost`):

```
http://localhost:3100/api/auth/social/google/callback
http://localhost:3100/api/auth/social/facebook/callback
```

Cada console aceita **várias** URLs de retorno, então cadastre as duas de uma vez
e os dois ambientes funcionam com a mesma credencial.

Não existe URL de Instagram: o botão do Instagram usa o login do Facebook.

| Provedor | Tempo | Custo | Testa em localhost? |
| --- | --- | --- | --- |
| Google | ~10 min | grátis | sim |
| Meta | ~20 min | grátis | só em modo Desenvolvimento |
| Apple | ~30 min | US$ 99/ano | **não** (recusa `http` e `localhost`) |

### Onde colar as credenciais

São **dois arquivos diferentes**, e nenhum dos dois vai para o git:

| Arquivo | Onde | Como nasce |
| --- | --- | --- |
| `.env` | sua máquina | já existe no projeto |
| `.env.production` | no servidor | `cp .env.example .env.production` ([deploy.md](deploy.md)) |

Os blocos deste guia dizem **`.env`** porque a ideia é você testar local
primeiro. Quando for para produção, as mesmas linhas vão para o
`.env.production` no servidor — trocando `localhost:3100` pelo domínio real.

**Comece pelo Google.** É o mais rápido e o de maior alcance no Brasil. Só ele já
deixa o login funcionando.

---

## 1. Google

### 1.1 Criar o projeto

1. Abra **https://console.cloud.google.com/projectcreate**
2. Nome: `Votto` → **Criar**
3. Confira no topo da tela que o projeto selecionado é o `Votto`.

### 1.2 Configurar a tela de consentimento

1. Abra **https://console.cloud.google.com/auth/overview**
2. **Começar** e preencha:
   - *Nome do app*: `Votto`
   - *E-mail de suporte*: o seu
   - *Público*: **Externo** ← precisa ser este, senão só sua organização entra
   - *Dados de contato*: o seu e-mail
3. Aceite os termos → **Criar**
4. Depois, em **Branding**, preencha o que o Google mostra ao cidadão:
   - *Logotipo*: `brand/app-icon-120.png` (rode `npm run assets:brand`)
   - *Link da página inicial*: `https://votto.online`
   - *Política de Privacidade*: `https://votto.online/privacidade`
   - *Termos de Serviço*: `https://votto.online/termos`

### 1.3 Criar a credencial

1. Abra **https://console.cloud.google.com/auth/clients**
2. **Criar cliente**
3. *Tipo de aplicativo*: **Aplicativo da Web**
4. *Nome*: `Votto Web`
5. ⚠️ A tela tem **dois** campos parecidos, um em cima do outro. Preencha só o
   de baixo:

   | Campo | O que fazer |
   | --- | --- |
   | **Origens JavaScript autorizadas** | **deixe vazio** |
   | **URIs de redirecionamento autorizados** | cole a URL completa |

   Em **URIs de redirecionamento autorizados** → **Adicionar URI**:
   ```
   https://votto.online/api/auth/social/google/callback
   ```
   Para testar local, adicione também `http://localhost:3100/api/auth/social/google/callback`

   > Se aparecer *"Invalid Origin: URIs must not contain a path or end with /"*,
   > você colou no campo de origens. Ele só aceita `http://localhost:3100`, sem
   > caminho — e o Votto não precisa dele: o fluxo roda todo no servidor, sem
   > nenhum JavaScript do Google no navegador.
6. **Criar**
7. Copie o **ID do cliente** e a **Chave secreta do cliente** (a chave só aparece
   agora — se perder, gere outra).

### 1.4 Publicar ⚠️

1. Abra **https://console.cloud.google.com/auth/audience**
2. Se o status for **Testes**, clique em **Publicar app** → **Confirmar**

> Sem isso só entram os e-mails cadastrados como usuários de teste (limite de
> 100). É o erro mais comum: tudo funciona para você e para mais ninguém.

### 1.5 No `.env`

```env
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-..."
```

---

## 2. Meta (Facebook + Instagram)

Um cadastro só, dois botões. O Instagram não tem credencial própria — a Meta
desligou a API que permitia isso em dezembro de 2024.

### 2.1 Criar o app

1. Abra **https://developers.facebook.com/apps**
2. **Criar app**
3. *Caso de uso*: **Autenticar e solicitar dados de usuários com o Login do Facebook**
4. *Nome do app*: `Votto` · *E-mail de contato*: o seu
5. **Criar app** (vai pedir sua senha do Facebook)

### 2.2 Ativar o Login do Facebook

1. No menu esquerdo: **Casos de uso** → no card do Login do Facebook, **Personalizar**
2. Em *Permissões*, confirme que **`public_profile`** está adicionado.
   É a única que o Votto usa — não peça e-mail, não guardamos.

### 2.3 URL de retorno

1. Menu esquerdo: **Login do Facebook** → **Configurações**
2. Em **URIs de redirecionamento do OAuth válidos**, cole:
   ```
   https://votto.online/api/auth/social/facebook/callback
   ```
3. **Salvar alterações**

### 2.4 Pegar as chaves

1. Menu esquerdo: **Configurações do app** → **Básico**
2. Copie o **ID do app** e o **Chave secreta do app** (clique em *Mostrar*)

### 2.5 Preencher o Básico

Ainda em **Configurações do app** → **Básico**. Os campos, em ordem de tela:

| Campo | O que colocar |
| --- | --- |
| *Namespace* | **deixe vazio** — servia à Canvas page (apps dentro do facebook.com), que a Meta descontinuou. Não é usado pelo login. |
| *Ícone do app* | `brand/app-icon-1024.png` (1024×1024, gerado pelo projeto — veja abaixo) |
| *Categoria* | **Notícias** (ou *Governo e política*) |
| *URL da Política de Privacidade* | `https://votto.online/privacidade` |
| *URL dos Termos de Serviço* | `https://votto.online/termos` |
| *Exclusão de dados do usuário* | escolha **Instruções de exclusão de dados** e cole `https://votto.online/exclusao-de-dados` |
| *Domínios do app* | `votto.online` |

O ícone sai de `npm run assets:brand`, junto com o resto da marca:

```bash
npm run assets:brand      # gera brand/app-icon-1024.png e brand/app-icon-120.png
```

É o **V** serifado em papel sobre o verde pinho — a mesma marca do favicon, e
não a folha do PWA, porque papel claro sobre a tela branca de consentimento
some. Quadrado e sem transparência: cada plataforma arredonda por conta própria,
e a Meta recusa PNG com canal alfa.

### 2.6 Colocar no ar ⚠️

1. No topo da tela, mude o seletor de **Desenvolvimento** para **Ao vivo**
2. A Meta pode pedir **verificação da empresa** (documento do CNPJ). Enquanto
   isso não sai, só contas listadas como testadores conseguem entrar.

### 2.7 No `.env`

```env
FACEBOOK_CLIENT_ID="..."
FACEBOOK_CLIENT_SECRET="..."
```

---

## 3. Apple

O mais trabalhoso dos três, e **exige conta paga** (US$ 99/ano). São quatro
valores em vez de dois, porque a Apple assina o segredo em vez de compartilhar um.

> **Não tente testar em localhost.** A Apple recusa `http` e recusa `localhost`.
> Ou você testa no domínio real, ou usa `SOCIAL_MODE="mock"`.

### 3.1 Conta e Team ID

1. Abra **https://developer.apple.com/account** e faça o enrollment se ainda não fez
2. Role até **Membership details** e copie o **Team ID** (10 caracteres)

### 3.2 App ID primário

A Apple não deixa criar o login web sozinho — ele precisa se pendurar num App ID.

1. Abra **https://developer.apple.com/account/resources/identifiers/list**
2. Botão **+** → **App IDs** → **Continue** → tipo **App** → **Continue**
3. *Description*: `Votto` · *Bundle ID*: **Explicit** → `online.votto.app`
4. Na lista de Capabilities, marque **Sign in with Apple**
5. **Continue** → **Register**

### 3.3 Services ID (este é o `client_id`)

1. Mesma tela: **+** → **Services IDs** → **Continue**
2. *Description*: `Votto Web` · *Identifier*: `online.votto.web`
   ← **este texto é o `APPLE_CLIENT_ID`**
3. **Continue** → **Register**
4. Clique no Services ID recém-criado na lista
5. Marque **Sign in with Apple** → **Configure**
6. *Primary App ID*: escolha o `online.votto.app` do passo anterior
7. *Domains and Subdomains*:
   ```
   votto.online
   ```
   **Sem `https://`, sem barra no final.** Com qualquer um dos dois a Apple
   responde "Invalid domain".
8. *Return URLs*:
   ```
   https://votto.online/api/auth/social/apple/callback
   ```
9. **Next** → **Done** → **Continue** → **Save**

> Se a tela oferecer um botão **Download**/**Verify** de domínio, hospede o
> arquivo em `https://votto.online/.well-known/apple-developer-domain-association.txt`
> e clique em Verify. A documentação atual da Apple diz que não é mais
> necessário, mas o portal ainda mostra isso em algumas contas. O caminho não
> pode ter redirect.

### 3.4 Chave `.p8`

1. Abra **https://developer.apple.com/account/resources/authkeys/list**
2. Botão **+**
3. *Key Name*: `Votto Sign in with Apple`
4. Marque **Sign in with Apple** → **Configure** → escolha o App ID primário → **Save**
5. **Continue** → **Register**
6. **Download** — ⚠️ **só dá para baixar uma vez.** Guarde o arquivo
   `AuthKey_XXXXXXXXXX.p8` num cofre de senhas.
7. Copie o **Key ID** (os 10 caracteres do nome do arquivo)

### 3.5 No `.env`

O `.p8` é um arquivo de várias linhas e precisa virar uma linha só, com `\n` no
lugar das quebras:

```bash
awk 'BEGIN{ORS="\\n"} {print}' AuthKey_XXXXXXXXXX.p8
```

Cole a saída entre aspas:

```env
APPLE_CLIENT_ID="online.votto.web"        # o Services ID, NÃO o App ID
APPLE_TEAM_ID="ABCDE12345"
APPLE_KEY_ID="XXXXXXXXXX"
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----\n"
```

---

## 4. Ligar tudo

### Testando na sua máquina (`.env`)

Além das credenciais dos passos acima:

```env
SOCIAL_MODE="real"
APP_URL="http://localhost:3100"
```

`CPF_VALIDATION_PROVIDER` pode continuar em `mock` — assim você exercita o fluxo
inteiro sem gastar consulta paga. Rode `npm run dev` e teste.

> Para voltar ao simulador e não usar provedor nenhum, basta
> `SOCIAL_MODE="mock"`.

### Em produção (`.env.production`, no servidor)

As mesmas credenciais, com o domínio real e o registro de CPF de verdade:

```env
SOCIAL_MODE="real"
APP_URL="https://votto.online"

# Sem isto, QUALQUER CPF válido é aceito e a garantia de um voto por
# cidadão não existe. Token em https://api.infosimples.com/administracao/tokens
CPF_VALIDATION_PROVIDER="infosimples"
INFOSIMPLES_TOKEN="..."
```

Lembre de cadastrar **as duas** URLs de retorno em cada console (a de localhost e
a de produção) se quiser que os dois ambientes funcionem.

Depois `git push` — o deploy aplica a migration e sobe. Provedor sem credencial
simplesmente não aparece na tela de login, então dá para ir soltando um por um.

---

## 5. Testar

1. Abra `https://votto.online/login` — só devem aparecer os botões dos provedores
   que você configurou
2. Clique em um, autorize, e você deve cair em `/entrar/cpf`
3. Informe um CPF e a data de nascimento correspondente → volta para a home logado
4. Saia e entre de novo pelo mesmo provedor → deve entrar **direto**, sem pedir
   CPF outra vez

Para conferir se os endpoints dos provedores continuam onde o código espera:

```bash
npm run check:sources
```

---

## 6. Quando der errado

| Sintoma | Causa quase certa |
| --- | --- |
| `Invalid Origin: URIs must not contain a path` (Google) | URL colada em *Origens JavaScript autorizadas*; ela vai em *URIs de redirecionamento* |
| `redirect_uri_mismatch` (Google) | A URL colada tem barra no final, `http`, ou `www` sobrando |
| Só você consegue entrar (Google) | App ainda em **Testes** — falta publicar (passo 1.4) |
| "URL bloqueada" (Facebook) | URL não está em *URIs de redirecionamento do OAuth válidos* |
| Só testadores entram (Facebook) | App ainda em **Desenvolvimento**, ou verificação de empresa pendente |
| "Invalid domain" (Apple) | Você colou `https://votto.online` — tem que ser só `votto.online` |
| `invalid_client` (Apple) | `APPLE_CLIENT_ID` está com o App ID em vez do Services ID |
| Login da Apple volta para `/login?error=state` | O callback precisa ser `https`; em `http` o cookie `SameSite=None` não sobrevive |
| Volta para `/login?error=state` | Você levou mais de 10 min na tela do provedor, ou o navegador bloqueia cookies |
| Todo mundo entra com qualquer CPF | `CPF_VALIDATION_PROVIDER` ainda está em `mock` |
