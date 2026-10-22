# MCP araç sözleşmeleri

## Ortak kurallar

Bilinmeyen girdi anahtarlarını reddet. `limit`: tam sayı 1..1000, varsayılan 100. `minMagnitude`: isteğe bağlı sonlu sayı 0..10. Her iki araç da yeniden eskiye sıralar. İsteğe bağlı alanlarda sessiz kırpma yapma.

### get_last_24h_earthquakes

Girdi: `{ limit?: number, minMagnitude?: number }`.
Aralık: çağrı başında alınan UTC now ile now−24 saat; iki sınır dahil. Takvimde bugün anlamına gelmez.

### get_earthquakes_by_province

Girdi: `{ province: string, start?: string, end?: string, limit?: number, minMagnitude?: number }`.
`province` zorunlu ve Türkiye'nin 81 ilinden biri. start ve end birlikte verilir veya ikisi de verilmez. Yoksa son 24 saat. Varsa açık Z veya UTC offset içeren ISO 8601 olmalı; offsetsiz tarihi reddet. start < end, end <= now. Eski aralıklar sorgulanabilir fakat arşiv garantisi verilmez.

İl normalizasyonu: boşlukları kırp, Unicode NFC, Türkçe büyük/küçük harf ve ASCII yazım farklarını normalize et; `İstanbul`, `istanbul`, `ISTANBUL`; `Iğdır`, `igdir`; `Şanlıurfa`, `sanliurfa` test edilir. Kanonik 81 il listesiyle tam eşleşme kullan. Kısmi/fuzzy eşleşme ve tahmin yok. Ham `province` boşsa il aracında eşleşmez. Yanıt il adını kanonik biçimde döndürür.

## Başarılı yanıt

SDK'nin seçilen sürümündeki outputSchema/structuredContent desteğini kullan; metin içerik de aynı sonuçtan üretilsin.

- `source`: AFAD; `sourceUrl`: kullanılan endpoint.
- `fetchedAtUtc`, `requestedRange: { startUtc, endUtc }`, `province` (il aracı için).
- `sourceRecordCount`: ham snapshot uzunluğu; `matchedCount`: filtrelenmiş, tekilleştirilmiş limit öncesi sayı; `returnedCount`: gösterilen sayı.
- `truncatedByLimit`: matchedCount > returnedCount.
- `coverage`: `{ status: "covered" | "possibly_incomplete" | "unknown", oldestAvailableUtc: string | null, latestAvailableUtc: string | null, sourceCap: 1000, reason: string }`.
- `warnings`: kullanıcıya açıklanacak kısa Türkçe mesajlar.
- `earthquakes`: `{ id, dateUtc, dateTurkey, latitude, longitude, depthKm, magnitude, magnitudeType, location, province, district }` dizisi. Nullable yer alanları açıkça null olur.

Kapsam kararı snapshot üzerinde, kullanıcı filtrelerinden ve limitinden önce verilir. Snapshot boşsa unknown; doluysa ve oldestAvailableUtc <= requestedRange.startUtc ise covered (yalnız kaynağın sunduğu güncel katalog kapsamında). Daha kısa ve 1000'e ulaşmayan yanıtta covered kabulü yalnız doğrulanan katalog davranışıyla gerekçelendirilebilir; ilk sürüm muhafazakâr olarak unknown döndürür. 1000 kayıt varsa ve istenen başlangıç en eski olaydan eskiyse possibly_incomplete. Diğer belirsizliklerde unknown. Her yanıtta kaynağın son 1000 olay sınırını belirt. Sayfalama veya toplam sayı tahmini yapma.

Boş eşleşme başarılı sonuçtur; “bu ilde hiç deprem olmadı” deme, “AFAD'ın erişilebilen kayıtlarında bu filtreyle eşleşme bulunamadı” de. covered arşiv eksiksizliği veya gerçek dünyadaki tüm depremlerin tespiti anlamına gelmez.

## Hatalar

Geçersiz girdiler SDK doğrulama mekanizmasıyla; çalışma anındaki AFAD/HTTP/JSON/şema hataları MCP tool error olarak (`isError: true`) döner. Kararlı kodlar: AFAD_TIMEOUT, AFAD_RATE_LIMITED, AFAD_UNAVAILABLE, AFAD_INVALID_RESPONSE. Kısa Türkçe mesaj kullan; ham HTML veya stack trace kullanıcıya dönmesin. Hata hiçbir zaman sıfır deprem sonucu gibi sunulmaz.
