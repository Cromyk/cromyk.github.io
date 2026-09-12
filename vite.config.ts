import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// WebXR exige contexto seguro. Há dois caminhos para chegar no Quest:
//
//   npm run quest  →  adb reverse + http://localhost:5173
//                     localhost já conta como seguro, então não precisa de TLS
//                     nem de aceitar certificado. É o caminho recomendado.
//
//   npm run dev:https  →  https://<ip-da-maquina>:5173
//                     necessário quando o Quest está no Wi-Fi e não no cabo.
//                     O certificado é autoassinado: o navegador do Quest vai
//                     pedir para você confirmar uma vez.
const comTls = process.env.HTTPS === '1';

export default defineConfig({
  // Caminhos relativos: assim o build funciona igual na raiz de um domínio ou
  // numa subpasta (GitHub Pages, por exemplo) sem reconfigurar nada.
  base: './',
  plugins: comTls ? [basicSsl()] : [],
  server: { host: true, port: 5173 },
});
