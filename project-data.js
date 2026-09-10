window.__EMBEDDED_PROJECT_DATA = 
{
  "version": "1.0.0",
  "projectName": "Varlık ve Süreç Yönetim Haritası",
  "lastModified": "2026-08-27T21:37:17.281Z",
  "trees": [
    {
      "id": "tree-assets",
      "name": "Varlıklarım",
      "x": 277,
      "y": 32,
      "rootNode": {
        "id": "node-varliklarim",
        "title": "Varlıklarım",
        "subtitle": "Tüm Şirket & Bireysel Varlıklar",
        "description": "Tüm taşınır, taşınmaz ve operasyonel ekipman envanteri",
        "icon": "box",
        "color": "emerald",
        "collapsed": false,
        "fields": [
          {
            "id": "f1",
            "key": "Toplam Varlık Grubu",
            "value": "4 Ana Kategori",
            "type": "text"
          },
          {
            "id": "f2",
            "key": "Son Güncelleme",
            "value": "2025-05-10",
            "type": "date"
          }
        ],
        "tags": [
          "Ana Ağaç",
          "Envanter"
        ],
        "children": [
          {
            "id": "node-araclarim",
            "title": "Araçlarım",
            "subtitle": "Motorlu ve Operasyonel Taşıtlar",
            "description": "Tarımsal ve ticari taşıt filosu",
            "icon": "car",
            "color": "emerald",
            "collapsed": false,
            "fields": [
              {
                "id": "f3",
                "key": "Toplam Araç",
                "value": "6 Adet",
                "type": "number"
              },
              {
                "id": "f4",
                "key": "Filo Durumu",
                "value": "Aktif",
                "type": "badge"
              }
            ],
            "tags": [
              "Filo",
              "Lojistik"
            ],
            "children": [
              {
                "id": "node-traktorler",
                "title": "Traktörler",
                "subtitle": "Ağır Saha & Çiftlik Ekipmanları",
                "icon": "tractor",
                "color": "blue",
                "collapsed": false,
                "fields": [
                  {
                    "id": "f5",
                    "key": "Çalışma Sahası",
                    "value": "Bursa / Yenişehir",
                    "type": "text"
                  }
                ],
                "tags": [
                  "Tarım",
                  "Makine"
                ],
                "children": [
                  {
                    "id": "node-erkunt",
                    "title": "Erkunt Traktör",
                    "subtitle": "Haşmet 110 Lüks Kabinli",
                    "description": "Ana tarla sürüm ve taşıma traktörü",
                    "icon": "tractor",
                    "color": "blue",
                    "collapsed": false,
                    "fields": [
                      {
                        "id": "f6",
                        "key": "Model Yılı",
                        "value": "2022",
                        "type": "number"
                      },
                      {
                        "id": "f7",
                        "key": "Plaka",
                        "value": "16 ERK 77",
                        "type": "text"
                      },
                      {
                        "id": "f8",
                        "key": "Çalışma Saati",
                        "value": "1420 Saat",
                        "type": "text"
                      },
                      {
                        "id": "f9",
                        "key": "Piyasa Değeri",
                        "value": "1.450.000 ₺",
                        "type": "currency"
                      }
                    ],
                    "tags": [
                      "Erkunt",
                      "Haşmet-110"
                    ],
                    "children": [
                      {
                        "id": "node-erkunt-sigorta",
                        "title": "Sigorta Tarihi & Poliçe",
                        "subtitle": "Kasko & Zorunlu Trafik",
                        "icon": "shield",
                        "color": "amber",
                        "collapsed": false,
                        "fields": [
                          {
                            "id": "f10",
                            "key": "Bitiş Tarihi",
                            "value": "2025-09-15",
                            "type": "date"
                          },
                          {
                            "id": "f11",
                            "key": "Poliçe No",
                            "value": "POL-8823901",
                            "type": "text"
                          },
                          {
                            "id": "f12",
                            "key": "Yıllık Prim",
                            "value": "24.500 ₺",
                            "type": "currency"
                          },
                          {
                            "id": "f13",
                            "key": "Durum",
                            "value": "Poliçe Yürürlükte",
                            "type": "badge"
                          }
                        ],
                        "tags": [
                          "Sigorta",
                          "Kasko"
                        ],
                        "children": []
                      },
                      {
                        "id": "node-erkunt-bakim",
                        "title": "Periyodik Bakım Kaydı",
                        "subtitle": "Yetkili Servis Bakımı",
                        "icon": "wrench",
                        "color": "slate",
                        "collapsed": false,
                        "fields": [
                          {
                            "id": "f14",
                            "key": "Son Bakım Tarihi",
                            "value": "2025-03-20",
                            "type": "date"
                          },
                          {
                            "id": "f15",
                            "key": "Gelecek Bakım (Saat)",
                            "value": "1750 Saat",
                            "type": "text"
                          },
                          {
                            "id": "f16",
                            "key": "Yapılan İşlem",
                            "value": "Yağ & Filtre Değişimi",
                            "type": "text"
                          }
                        ],
                        "tags": [
                          "Servis",
                          "Bakım"
                        ],
                        "children": []
                      }
                    ]
                  },
                  {
                    "id": "node-new-holland",
                    "title": "New Holland T5",
                    "subtitle": "T5.115 Electro Command",
                    "icon": "tractor",
                    "color": "indigo",
                    "collapsed": true,
                    "fields": [
                      {
                        "id": "f17",
                        "key": "Model Yılı",
                        "value": "2021",
                        "type": "number"
                      },
                      {
                        "id": "f18",
                        "key": "Plaka",
                        "value": "16 NH 550",
                        "type": "text"
                      }
                    ],
                    "tags": [
                      "New-Holland"
                    ],
                    "children": [
                      {
                        "id": "node-arac-giderleri-butce",
                        "title": "Araç Bakım & Sigorta Tahsisatı",
                        "subtitle": "Traktör & Taşıt Bütçe Fonu",
                        "icon": "dollar-sign",
                        "color": "orange",
                        "collapsed": false,
                        "fields": [
                          {
                            "id": "f42",
                            "key": "Ayrılan Bütçe",
                            "value": "95.000 ₺",
                            "type": "currency"
                          },
                          {
                            "id": "f43",
                            "key": "Kalan Kullanım",
                            "value": "70.500 ₺",
                            "type": "currency"
                          }
                        ],
                        "tags": [
                          "Gider Havuzu"
                        ],
                        "children": []
                      }
                    ]
                  }
                ]
              },
              {
                "id": "node-bicerdover",
                "title": "Biçerdöverler",
                "subtitle": "Hasat Makineleri",
                "icon": "wrench",
                "color": "amber",
                "collapsed": false,
                "fields": [
                  {
                    "id": "f19",
                    "key": "Adet",
                    "value": "1",
                    "type": "number"
                  }
                ],
                "children": [
                  {
                    "id": "node-claas",
                    "title": "Claas Lexion 770",
                    "subtitle": "2020 Model Hasat Makinesi",
                    "icon": "wrench",
                    "color": "amber",
                    "fields": [],
                    "children": []
                  }
                ]
              }
            ]
          },
          {
            "id": "node-gayrimenkuller",
            "title": "Gayrimenkul & Araziler",
            "subtitle": "Tarım Arazileri & Tesisler",
            "icon": "building",
            "color": "teal",
            "collapsed": false,
            "fields": [
              {
                "id": "f20",
                "key": "Toplam Alan",
                "value": "120 Dönüm",
                "type": "text"
              }
            ],
            "children": [
              {
                "id": "node-tarla-1",
                "title": "Yenişehir Sulu Tarla",
                "subtitle": "45 Dönüm Yonca / Mısır",
                "icon": "tag",
                "color": "teal",
                "fields": [
                  {
                    "id": "f21",
                    "key": "Ada / Parsel",
                    "value": "142 / 12",
                    "type": "text"
                  },
                  {
                    "id": "f22",
                    "key": "Sulama Tipi",
                    "value": "Damlama",
                    "type": "text"
                  }
                ],
                "children": []
              }
            ]
          }
        ]
      }
    },
    {
      "id": "tree-budget",
      "name": "Finansman & Bütçe",
      "x": 177,
      "y": 746,
      "rootNode": {
        "id": "node-butce-plan",
        "title": "Yıllık Bütçe Planı 2025",
        "subtitle": "Gider Kalemleri ve Tahsisler",
        "icon": "dollar-sign",
        "color": "orange",
        "collapsed": false,
        "fields": [
          {
            "id": "f40",
            "key": "Dönem",
            "value": "2025 Mali Yılı",
            "type": "text"
          },
          {
            "id": "f41",
            "key": "Toplam Bütçe",
            "value": "650.000 ₺",
            "type": "currency"
          }
        ],
        "tags": [
          "Maliye",
          "Bütçe"
        ],
        "children": []
      }
    }
  ],
  "relations": [
    {
      "id": "rel-erkunt-butce",
      "sourceNodeId": "node-erkunt",
      "targetNodeId": "node-arac-giderleri-butce",
      "label": "Bütçe Tahsis Kalemi",
      "type": "flow",
      "color": "#f97316",
      "style": "dotted"
    }
  ]
}
;
