# AFAD kaynak sözleşmesi

## Kaynaklar ve öncelik

- Resmî belge: https://deprem.afad.gov.tr/event-service
- Kullanıcının aktardığı güncel servis duyurusu: yeni endpoint, son 1000 olay sınırı, birkaç saniyede güncelleme, UTC ve varsayılan yeniden eskiye sıralama.
- Canlı doğrulama: 22 Ekim 2026 tarihinde yeni endpoint'e `limit=2&format=json` isteği başarılı oldu.

Belgenin indekslenmiş eski içeriğinde limitsiz sonuç, zorunlu tarih ve varsayılan artan sıralama gibi güncel duyuruyla çelişen ifadeler var. Bu projede kullanıcının aktardığı güncel sınırlamalar esas alınır. `limit` ve `orderby` açıkça gönderilir. Eski endpoint kullanılmaz.

## Endpoint

```text
https://servisnet.afad.gov.tr/apigateway/deprem/apiv2/event/filter
```

En az bir parametre gönder. Tüm filtreler son 1000 deprem üzerinde çalışır; istek başına en fazla 1000 kayıt. Çoklu istek veya offset geçmiş arşiv erişimi sağlamaz.

Belgede geçen parametre aileleri: `start`, `end`; kutu için `minlat`, `maxlat`, `minlon`, `maxlon`; radyal için `lat`, `lon`, `minrad`, `maxrad`; `minmag`, `maxmag`, `magtype`; `mindepth`, `maxdepth`; `limit`, `offset`, `orderby`, `format`; tek kayıt için `eventid`. Bu parametrelerin tümü bu projede canlı doğrulanmadı. İlk sürüm yalnız snapshot sorgusunu kullanır; il sorgu parametresi belgelenmemiştir. Radyal birim belirsizlikleri ilk sürümü etkilemez.

## Gözlemlenen kayıt örneği

```json
{"rms":"0.61","eventID":"597125","location":"Yeşilyurt (Malatya)","latitude":"38.24983","longitude":"38.1735","depth":"7","type":"ML","magnitude":"2.4","country":"Türkiye","province":"Malatya","district":"Yeşilyurt","neighborhood":"Seyituşağı","date":"2026-10-22T15:09:37","isEventUpdate":false,"lastUpdateDate":null}
```

Bu belgeye gömülü tarihli örnek canlı durum göstergesi değildir. Sayısal değerler string gelir. `date` offsetsiz görünür ancak UTC'dir; yerel saat kabul edilmez. `lastUpdateDate` null olabilir. `province`, `district`, `neighborhood` boş/null olabilir; deniz veya sınır ötesi olayları zorla bir ile eşleme. Ek alanları tolere et, zorunlu kimlik/tarih/koordinat/büyüklük alanlarının bozuk olmasını hata say.

## Zaman

AFAD'a tarih gönderilecekse UTC, `YYYY-MM-DDTHH:mm:ss` biçimi ve URLSearchParams kullanılır. Uygulama çıktısı UTC için Z, Türkiye için +03:00 taşır. Örnek: `2026-10-22T15:09:37Z` → `2026-10-22T18:09:37+03:00`.
