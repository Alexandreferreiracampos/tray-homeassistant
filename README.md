# Home Tray

Aplicativo Windows que mantém seu home na bandeja e abre a página em uma janela de 400 × 300 próxima ao ícone. Em telas com escala, as dimensões usam pixels lógicos do Windows.

Execute `dist/HomeTray.exe`. Na primeira abertura, informe o IP, com porta se necessário (por exemplo `192.168.1.100:8123`). HTTP é usado quando o protocolo é omitido; HTTPS também é aceito. O endereço fica salvo em `%APPDATA%/home-tray/settings.json`.

- Clique no ícone para abrir ou ocultar a janela.
- Clique fora da janela ou pressione Esc para ocultá-la.
- Clique com o botão direito para recarregar, configurar ou sair.
- Se o Windows esconder o ícone, procure na seta de ícones ocultos da bandeja.

A página precisa estar acessível pela rede do computador. Certificados HTTPS devem ser válidos. A interface exibida é a do próprio site; páginas sem layout responsivo podem precisar de rolagem. Sessões de login persistem no perfil local do aplicativo.

## Desenvolvimento

Com Node.js instalado:

```powershell
npm install
npm start
npm run dist
```

O executável portátil é gerado em `dist/HomeTray.exe`. Não possui assinatura digital.
