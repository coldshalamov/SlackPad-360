# .NET 10 + WebView2 smoke — not executed

reason: no_dotnet10_sdk
installed_sdks:
  - 8.0.419
selected_tfm: net10.0-windows
selected_webview2: 1.0.4078.44
install_url: https://dotnet.microsoft.com/download/dotnet/10.0
commands: |
  dotnet --list-sdks
  # expect 10.x
  mkdir %TEMP%\slackpad-host-smoke && cd %TEMP%\slackpad-host-smoke
  dotnet new winforms -n WebView2Smoke -f net10.0-windows
  cd WebView2Smoke
  dotnet add package Microsoft.Web.WebView2 --version 1.0.4078.44
  dotnet restore
  dotnet build -c Release
