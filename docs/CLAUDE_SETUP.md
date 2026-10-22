# Claude çalışma ortamı ve bağlantı

## Geliştirme

Bu klasörü Claude Code'da aç. Kökteki CLAUDE.md proje yönergeleridir. İlk görev `prompts/01-bootstrap.md` içeriğidir. Kontrol edilen yerel ortam: Node v24.12.0, npm 11.6.2; node yolu `/usr/local/bin/node`.

Uygulama tamamlandığında npm ci, npm run typecheck, npm test, npm run build sırasıyla çalışmalı. `dist/index.js` üretilmeden aşağıdaki bağlantılar çalışmaz. Hazırlık aşamasında otomatik bağlantı kurulmadı.

## Claude Desktop (macOS)

Örnek: `examples/claude-desktop.config.example.json`.
Hedef: `~/Library/Application Support/Claude/claude_desktop_config.json`.
Mevcut ayarları koruyarak yalnız `mcpServers.afad-earthquake` kaydını birleştir. Tüm dosyayı örnekle ezme. `command` ve `args` mutlak yollar olmalı; farklı bilgisayarda node yolunu doğrula. Claude'u tamamen kapatıp yeniden aç; araçların görünmesini kontrol et.

## Claude Code

Proje klasöründe, build sonrasında:

```sh
claude mcp add afad-earthquake -- /usr/local/bin/node /Users/gorkemparadise/Desktop/earthquake-mcp/dist/index.js
```

Claude Code içinde `/mcp` ile bağlantıyı kontrol et. Desktop ile Code ayrı yapılandırmalardır. Bu doküman global ayarları değiştirmez; proje paylaşımı istenirse CLI'nin güncel kapsam seçeneklerini kontrol ederek proje kapsamı seç.

## Deneme soruları

- Son 24 saatteki son 10 depremi Türkiye saatiyle göster.
- Son 24 saatte İzmir'de gerçekleşen depremleri listele.
- İstanbul'da son 24 saatte 3 ve üzeri deprem var mı? Verinin kapsama sınırını da belirt.

Yanıtta AFAD kaynağı, veri çekim zamanı ve kapsam bilgisi görünmeli. Sorun halinde önce derleme yolunu ve node yolunu, sonra Claude sunucu loglarını kontrol et. stdio sunucusunun elle başlatıldığında sessizce istemci beklemesi normaldir.

Kaynaklar:
- https://py.sdk.modelcontextprotocol.io/get-started/real-host/
- https://ts.sdk.modelcontextprotocol.io/v2/
