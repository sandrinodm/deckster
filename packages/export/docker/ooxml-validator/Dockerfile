# The Open XML SDK validator (DocumentFormat.OpenXml 3.3) as a command: prints one JSON result per
# file with every schema and semantic error. Used by `deckster export --verify`.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY oxv.csproj Program.cs ./
RUN dotnet publish -c Release -o /out
FROM mcr.microsoft.com/dotnet/runtime:8.0
COPY --from=build /out /app
ENTRYPOINT ["dotnet", "/app/oxv.dll"]
