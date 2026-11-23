# LibreOffice Impress without a GUI, poppler to rasterise its PDF output and fontTools to turn the
# brand's WOFF2 files into fonts LibreOffice can load. Used by `deckster export --verify`. Liberation
# (metric-compatible with Arial, Times New Roman and Courier New), Carlito (Calibri) and Caladea
# (Cambria) stand in for the fonts a recipient's computer has, so a pass without the brand's fonts
# shows the substitutes PowerPoint and Keynote would use.
FROM debian:bookworm-slim
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libreoffice-impress-nogui fonts-dejavu fonts-liberation2 fonts-crosextra-carlito \
    fonts-crosextra-caladea fontconfig poppler-utils python3-fonttools python3-brotli \
  && rm -rf /var/lib/apt/lists/*
COPY fonts.conf /etc/fonts/local.conf
COPY render.sh /usr/local/bin/render
RUN chmod +x /usr/local/bin/render && fc-cache -f >/dev/null
ENTRYPOINT ["/usr/local/bin/render"]
