Bu repodaki AFAD Earthquake MCP'nin çalışan ilk sürümünü uygula.

Önce CLAUDE.md, docs/ARCHITECTURE.md, docs/AFAD_API.md, docs/TOOLS.md ve docs/IMPLEMENTATION_PLAN.md dosyalarını oku. Mimarideki kararları uygula; repo şu anda hazırlık aşamasında, uygulama kodu henüz yok.

Node.js 24 LTS + TypeScript strict + ESM + npm kullan. Resmî MCP TypeScript SDK'nin güncel kararlı sürümünü doğrula; o sürümün resmî API'siyle çalış ve sürümü lockfile'a sabitle. Zod, Vitest ve yerleşik fetch ile yeterli en küçük bağımlılık setini kur.

stdio üzerinden get_last_24h_earthquakes ve get_earthquakes_by_province araçlarını eksiksiz oluştur. AFAD'ın yeni endpoint'inden son 1000 kaydı çek, il filtresini province alanında uygula, UTC ve Türkiye saati ayrımını koru, kaynak kapsamını ve kullanıcı limitini çıktı metadata'sında ayrı göster. Ağ/şema hatalarını boş sonuç gibi sunma.

Birim testlerini ve SDK istemcisiyle alt süreç üzerinden tools/list ile iki tools/call çağrısını doğrulayan ağdan bağımsız entegrasyon testini yaz. Typecheck, test ve build komutlarını çalıştır, sorunları gider. README'yi gerçek duruma göre güncelle ve Claude bağlantı örneğinin derlenen giriş dosyasıyla eşleştiğini kontrol et.

Bu görevde çalışan sunucuyu ve testleri tamamla. Kullanıcının global Claude ayarlarını değiştirme; bağlantı sonraki adım. Sonunda değişen dosyaları, doğrulama sonuçlarını ve Claude bağlantısı için tek sonraki adımı Türkçe özetle. Gerçek bir engel yoksa yalnız plan sunup durma.
