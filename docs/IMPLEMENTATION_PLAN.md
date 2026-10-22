# Uygulama planı

## 1 — Çalışan ilk sürüm

1. Node/npm ortamını doğrula; package.json, lockfile, tsconfig, test yapılandırması ve gerekli bağımlılıkları oluştur. SDK'nin kararlı sürümünü resmî kaynaktan seç ve kaydet.
2. Ham şema, domain tipleri, UTC yardımcıları ve kanonik 81 il normalizasyonunu yaz.
3. Sabit endpoint kullanan AfadClient ve enjekte edilebilir fetch/saat ile servis katmanını yaz.
4. İki aracı girdi/çıktı şemalarıyla kaydet; stdio girişini oluştur.
5. Testleri ve SDK istemcisiyle gerçek alt süreç üzerinden tools/list + iki tools/call entegrasyonunu çalıştır. Entegrasyon testinde üretim URL'sini açan genel bir ayar yerine enjekte edilen sahte istemciyle ayrı test sunucusu kullan.
6. Build, typecheck ve testleri çalıştır; README ve bağlantı örneklerini doğrula.

## Kabul ölçütleri

- Tam olarak iki araç keşfedilebilir; geçerli çağrılar yapılandırılmış veri ve okunabilir metin döndürür.
- Sabit saatle son 24 saatin iki sınırı ve sınır dışı olaylar test edilir.
- UTC/TSİ dönüşümü farklı süreç saat dilimlerinde aynı sonucu verir; offsetsiz kullanıcı tarihleri reddedilir.
- Türkçe/ASCII il varyasyonları, bilinmeyen il, boş province ve ilçe adından yanlış eşleşme test edilir.
- Sayısal string, null yer alanları, bozuk yanıt, HTTP 429/5xx, timeout ve retry sınırı test edilir.
- Güncellenmiş aynı ID iki kez gösterilmez; sıralama ve limit filtrelemeden sonra uygulanır.
- 1000 kayıt, kapsanmayan eski aralık, boş snapshot ve limit kesilmesi metadata ile görünürdür.
- Varsayılan testler AFAD'a erişmez. Entegrasyon testi stdio stdout'un protokol dışında metin üretmediğini doğrular.
- Canlı smoke kontrolü ayrı komutla küçük, salt okunur istektir; ağ yoksa geçti diye raporlanmaz.

## 2 — Claude bağlantısı

Derlenmiş çıktı SDK istemcisiyle doğrulandıktan sonra `docs/CLAUDE_SETUP.md` üzerinden bağlantıyı yap. Son 24 saat ve il sorularını Claude'da dene. Bağlantıdan önce sunucunun hazır olduğunu, bağlantıdan sonra araçların görülebildiğini ayrı ayrı raporla.
