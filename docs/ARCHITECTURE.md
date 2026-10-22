# Mimari

## Kararlar

Yerel süreç olarak çalışan TypeScript MCP sunucusu seçildi. Claude süreci başlatır, stdio üzerinden tools/list ve tools/call konuşur. AFAD'a HTTPS GET gönderilir. İlk sürümde sunucu portu, kullanıcı hesabı, veritabanı, Docker veya uzaktan barındırma gerekmez.

```text
Claude Desktop / Claude Code
         │ MCP / stdio
         ▼
MCP tools (girdi/çıktı şemaları)
         ▼
EarthquakeService (zaman aralığı, filtre, kapsam, sunum)
         ▼
AfadClient (sabit endpoint, timeout, HTTP, ham şema)
         ▼
AFAD canlı API
```

## Hedef dizinler

```text
src/
  index.ts                       # başlatma, shutdown, stderr
  server.ts                      # SDK sunucusu ve araç kaydı
  config.ts                      # sabit endpoint / çalışma ayarları
  afad/client.ts                 # fetch, timeout, retry, hata sınıfları
  afad/schema.ts                 # AFAD ham veri doğrulaması
  domain/earthquake.ts           # normalize kayıt ve sonuç tipleri
  services/earthquake-service.ts # ortak snapshot ve filtre hattı
  tools/last-24h.ts
  tools/by-province.ts
  utils/time.ts
  utils/province.ts              # 81 il ve Türkçe normalizasyon
  utils/errors.ts
  data/provinces.ts
tests/                          # kök test dizini
  fixtures/afad-events.json
  unit/
  integration/stdio.test.ts
```

`tests/` kök dizindedir; üretim derlemesine girmez. Test fixture'ları deterministik ve sentetik olabilir; canlı yanıt gibi sunulmaz.

## Veri hattı

1. Girdiyi Zod ile doğrula; ortak now değerini bir kez UTC al.
2. Sabit endpoint'ten `limit=1000&orderby=timedesc&format=json` ile son kayıt snapshot'ını al. İlk sürüm zaman/il filtrelerini bu snapshot üzerinde uygular. Bu seçim kapsam sınırını gözlemlememizi sağlar.
3. Yanıtın dizi ve kayıtların beklenen şemada olduğunu doğrula. Geçersiz kaydı sessizce düşürme; şema hatası döndür.
4. Sayısal stringleri sonlu sayıya, date alanını UTC ISO'ya dönüştür. eventID string kalsın. Aynı ID'yi tekilleştir; güncelleme varsa en güncel kaydı seç.
5. İstenen zaman aralığını, büyüklüğü ve varsa ili yerelde filtrele. Tarih azalan, eşitlikte ID ile kararlı sırala.
6. Tamlık bilgisini hesapla, sonra kullanıcı limitini uygula. Sayımların limit öncesi/sonrası anlamını ayır.
7. Yapılandırılmış sonuç ile aynı veriden üretilmiş kısa metin döndür.

## Dayanıklılık

- İstek başına 10 saniye timeout, en fazla 1 tekrar; yalnız ağ/timeout, 429 ve 5xx için. 429 Retry-After değerine sınırlı bekleme uygula; toplam süreyi en fazla 25 saniye tut.
- 4xx (429 hariç), JSON/şema ve doğrulama hataları tekrar edilmez.
- İlk sürüm cache kullanmaz; her tool çağrısı yeni snapshot ister. Aynı anda gelen çağrılarda gereksiz istek çoğaltmayı önleyen in-flight paylaşımı uygulanabilir; sonradan gelen çağrılara eski yanıt sunulmaz.
- SIGINT/SIGTERM sırasında taşıma ve devam eden istekler kapatılır.
- SDK tool annotation: readOnlyHint=true, destructiveHint=false, openWorldHint=true; canlı sonuçlar değiştiği için idempotency hakkında doğrulanmamış garanti verme.

## Kapsam dışında

Deprem tahmini, erken uyarı, bildirim, geçmiş arşivi, harita ve uzak HTTP/SSE taşıması. Bunlar ayrı karar gerektirir.
