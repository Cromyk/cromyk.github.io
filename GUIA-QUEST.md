# Instalar o Critter Quest como app no Quest

Passo a passo para gerar o APK e pôr o jogo na biblioteca do headset, com ícone
próprio, abrindo direto em passthrough.

## Leia isto antes

O Quest não roda WebXR imersivo a partir de arquivos empacotados dentro do APK.
O app é uma casca que aponta para o jogo **hospedado num domínio HTTPS público**,
e ele só abre se o Android conseguir provar que o domínio e o APK são seus — a
verificação de *Digital Asset Links*.

Consequência prática, e não tem como contornar:

> **Você precisa publicar o jogo na web antes de empacotar.** Sem isso o app
> instala, mas fecha sozinho ao abrir.

Se a ideia era só jogar rápido, `npm run quest` continua sendo o caminho — não
precisa de nada disso.

## O que você já tem

Verifiquei nesta máquina:

| | |
|---|---|
| Node | v26.4.0 |
| JDK 21 | `C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot` (do Cromyk) |
| JDK 17 | `~/Apps/jdk17_extract/jdk-17.0.17+10` — é este que o Bubblewrap quer |
| adb | `~/Apps/Android/Sdk/platform-tools/adb` |
| Bubblewrap | instalado nesta sessão (`bubblewrap --version` responde) |
| Ícones, manifest, service worker | prontos, gerados pelo projeto |

Falta **um lugar para hospedar**. É o único pré-requisito em aberto.

> ⚠️ **Atenção ao JDK — aqui é ao contrário do Cromyk.** Na primeira execução o
> Bubblewrap pergunta:
>
> ```
> ? Do you want Bubblewrap to install the JDK (recommended)?
>   (Enter "No" to use your own JDK 17 installation)
> ```
>
> **Responda `Yes`.** Ele baixa um JDK só dele, em `~/.bubblewrap`, e nada na
> máquina é afetado.
>
> Repare que ele quer **JDK 17**, e não o 21 — o 21 é exigência do Capacitor no
> `cromyk-game`, não daqui. Se responder `No`, ele usa o `JAVA_HOME`, que nesta
> máquina já aponta para um JDK 17 (`~/Apps/jdk17_extract/...`) e portanto serve.
> Apontar o `JAVA_HOME` para o JDK 21 aqui **quebraria** o build.

---

## Passo 1 — Publicar o jogo em HTTPS

```bash
npm run build
```

Isso gera `dist/`, que é uma pasta estática — qualquer host serve. Três opções,
da mais durável para a mais rápida:

**GitHub Pages** — se você joga o projeto num repositório, publica a `dist/` e
ganha `https://<usuário>.github.io/critter-quest/`. Estável e de graça.

**Cloudflare Pages / Netlify / Vercel** — arrastar a pasta `dist/` já resolve, e
o domínio é fixo.

**Túnel temporário** — para provar o fluxo hoje sem criar conta:

```bash
npm run serve:dist                              # terminal 1
npx cloudflared tunnel --url http://localhost:5200   # terminal 2
```

Sai uma URL `https://*.trycloudflare.com`. Serve para testar de ponta a ponta,
mas **a URL morre quando você fecha o túnel** e o APK fica apontando para o vazio.
Não use para um app que você quer manter.

> ✅ **Já está resolvido.** O jogo está publicado em **https://cromyk.github.io/**,
> pelo repositório `Cromyk/cromyk.github.io`. A publicação é automática: cada
> `git push` na `main` dispara o workflow, que roda os testes, gera os ícones,
> faz o build e publica.
>
> Está na **raiz da origem** de propósito — o `assetlinks.json` do passo 4 só
> funciona em `https://cromyk.github.io/.well-known/assetlinks.json`, porque os
> Digital Asset Links são verificados por origem, nunca por subpasta.

Para publicar uma alteração daqui em diante:

```bash
git add -A && git commit -m "..." && git push
```

## Passo 2 — Conferir o que foi publicado

```bash
npm run pwa:check <SEU-SITE>
```

Isso busca o site de verdade e confere manifest, ícones, service worker e HTTPS.
Nesta etapa ele ainda vai avisar que falta o `assetlinks.json` — correto, ele só
existe a partir do passo 4.

## Atalho: o caminho já está montado

Em `../critter-quest-apk` o pacote já foi preparado nesta sessão, **sem passar
pelo `bubblewrap init`** — o CLI dele é interativo e o inquirer exige um TTY de
verdade, então dois scripts chamam a mesma API por baixo:

| Arquivo | O que faz |
|---|---|
| `gerar-manifest.mjs` | monta o `twa-manifest.json` a partir do manifest publicado |
| `gerar-projeto.mjs` | gera o projeto Android a partir dele |

O `gerar-manifest.mjs` força três coisas que importam:

- `isMetaQuest: true` — pacote compatível com o Horizon OS
- `horizonOSAppMode: 'immersive'` — abre direto no passthrough
- **`enableXRScene: true`** — a permissão `USE_SCENE`. **Sem ela o jogo não
  enxerga o chão nem os móveis**, e as criaturas não teriam onde nascer. É o
  ajuste mais fácil de esquecer.

Também foi preciso um **SDK espelho** em `~/.bubblewrap/android_sdk`: o
Bubblewrap procura `tools/` ou `bin/` na raiz do SDK (layout antigo), e o SDK
desta máquina usa `cmdline-tools/`. O espelho é só um conjunto de junctions
apontando para o SDK real — nada foi alterado no SDK que o `cromyk-game` usa.

Para recompilar depois de mudar algo no `twa-manifest.json`:

```bash
cd ../critter-quest-apk
node gerar-projeto.mjs
JAVA_HOME="/c/Users/marco.souza/Apps/jdk17_extract/jdk-17.0.17+10" \
  ./gradlew assembleRelease --no-daemon
node assinar.mjs
adb install -r app-release-signed.apk
```

Três coisas que custaram tempo e vão morder de novo:

- **`local.properties` precisa de barras normais.** Num arquivo `.properties` a
  barra invertida é caractere de escape, então `sdk.dir=C:\Users\...` vira lixo
  silenciosamente e o Gradle falha lá na frente com um enigmático
  *"A sintaxe do nome do arquivo … está incorreta"* dentro do R8.
- **O Node não executa `.bat`.** Desde as correções de injeção de argumentos no
  Windows, `execFileSync` recusa `apksigner.bat` com `EINVAL`. Por isso o
  `assinar.mjs` chama `java -jar lib/apksigner.jar` direto.
- **`--no-daemon` sempre.** Mesma armadilha do `cromyk-game`: um daemon do
  Gradle que ficou vivo com outro JDK é reaproveitado e o build falha como se a
  correção não tivesse funcionado.

O resto desta seção descreve o caminho interativo oficial, caso você prefira.

## Passo 3 — Inicializar o pacote

```bash
npm install --global @meta-quest/bubblewrap-cli
bubblewrap --version
```

Crie o projeto do APK **fora** da pasta do jogo, para não misturar as coisas:

```bash
mkdir ../critter-quest-apk
cd ../critter-quest-apk
bubblewrap init --manifest=<SEU-SITE>/manifest.webmanifest --metaquest
```

Com o túnel desta sessão, o comando fica:

```bash
bubblewrap init --manifest=https://longitude-relationship-tennis-reasonable.trycloudflare.com/manifest.webmanifest --metaquest
```

> Este comando é interativo — precisa de um terminal de verdade. Rode você
> mesmo, porque ele pede a senha do keystore.

Ele faz várias perguntas. As que importam:

| Pergunta | Responda |
|---|---|
| App mode | **immersive** — é o que faz abrir direto no passthrough |
| Android package identifier | `com.marcosouza.critterquest` |
| Signing key | deixe ele gerar uma nova |
| Horizon Billing | não |

> 🔑 **Guarde a senha do keystore e o arquivo `android.keystore`.** Perdeu a
> chave, perdeu a capacidade de atualizar o app — a única saída vira desinstalar
> e reinstalar com outro nome de pacote.

Na primeira execução ele baixa o próprio JDK e Android SDK. Demora alguns
minutos.

## Passo 4 — Provar que o domínio é seu

Pegue a impressão digital do certificado:

```bash
keytool -list -v -keystore android.keystore -alias android
```

(Se o `keytool` não estiver no PATH, ele está em
`"/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot/bin/keytool"`.)

Copie a linha que começa com **`SHA256:`** — cuidado para não pegar a `SHA1:`,
que é o erro mais comum aqui. Então, de volta na pasta do jogo:

```bash
cd ../critter-quest
npm run assetlinks -- <cole-o-SHA256-aqui>
npm run build
```

**Publique de novo** e confirme:

```bash
npm run pwa:check <SEU-SITE>
```

Agora tem que dar `Pronto para empacotar.` Abra também
`<SEU-SITE>/.well-known/assetlinks.json` no navegador — se der 404, o host não
está servindo pastas que começam com ponto, e isso precisa ser resolvido antes
de seguir.

## Passo 5 — Gerar o APK

```bash
cd ../critter-quest-apk
bubblewrap build
```

Ele pede as senhas do keystore e produz **`app-release-signed.apk`**.

## Passo 6 — Instalar no headset

Conecte o Quest por cabo, ponha o headset e aceite *Permitir depuração USB*.

```bash
adb install -r app-release-signed.apk
```

No Quest: **Biblioteca de apps → Fontes desconhecidas → Critter Quest**.

## Testando

Ao abrir, o jogo deve ir **direto para o passthrough**, sem tela intermediária.

- [ ] Você vê seu quarto, não um fundo preto
- [ ] Uma criatura aparece no seu chão ou em cima de um móvel em poucos segundos
- [ ] O gatilho materializa a esfera na mão
- [ ] Mover o braço faz aparecer o arco pontilhado
- [ ] Soltar arremessa com a força do movimento
- [ ] Acertar suga a criatura e a esfera sacode três vezes
- [ ] O painel no pulso esquerdo mostra esferas e capturas
- [ ] Fechar e reabrir mantém a coleção

Para ver os erros enquanto joga, com o headset conectado:

```bash
adb logcat -s chromium:* -v brief
```

## Atualizando depois

**Mudou só o jogo** (que é quase sempre o caso): `npm run build`, publique, e
pronto. O app carrega do site, e o service worker é network-first no HTML — o
Quest pega a versão nova ao abrir. **Não precisa reinstalar o APK.**

**Mudou o nome, o ícone ou o manifest:** aí sim regenere:

```bash
cd ../critter-quest-apk
bubblewrap update
bubblewrap build
adb install -r app-release-signed.apk
```

## Quando der errado

**Abre e fecha na hora** — quase sempre é o Digital Asset Links. Confirme que
`<SEU-SITE>/.well-known/assetlinks.json` responde, que o SHA-256 é o da chave que
assinou *este* APK, e que o `package_name` bate com o que você deu no `init`.

**Abre numa janela 2D com barra de URL** — a verificação falhou e ele caiu no
modo navegador. Mesma investigação acima.

**Erro de versão do Java no build** — o Bubblewrap quer **JDK 17**, não o 21. O
mais simples é deixá-lo instalar o próprio JDK (veja o aviso no começo). Se já
respondeu `No` e quer corrigir, apague `~/.bubblewrap/config.json` e rode
`bubblewrap doctor`.

**`adb` não enxerga o headset** — ponha o headset na cabeça: o diálogo de
autorização de depuração aparece lá dentro, e fica esperando. `adb devices` deve
listar o aparelho sem a marca `unauthorized`.

**O jogo abre mas fica preto** — passthrough negado. Confirme que o Quest tem a
sala configurada (Configurações → Espaço físico) e que é um Quest 3 ou 3S.
